#!/usr/bin/env python3
"""Vector tiles (PMTiles) of nationwide 용도지역 and 개발제한구역 for the map layer planning/zoning.

    python scripts/vworld/harvest_data_api.py --box 124.5,33.0,131.0,38.7 --out data/raw/vworld/zoning-api-20261030 \
        LT_C_UQ111 LT_C_UQ112 LT_C_UQ113 LT_C_UQ114 LT_C_UD801
    python scripts/vworld/build_zoning_pmtiles.py
    gh release create zoning-<date> dist/zoning/* --notes-file dist/zoning/RELEASE_NOTES.md

Input: the VWorld 2D data API pages in data/raw/vworld/zoning-api-20261030/<dataset>/page_*.json, each checked
against the SHA-256 in data/manifests/vworld-data-api-20261030.json.

Each feature keeps `zid` (VWorld feature id, e.g. LT_C_UQ111.12), `kind` (urban, management, agri, conservation,
gb), `uname` as VWorld gives it, `name` (uname, or a label for the blank and 기타/미분류 rows), `rank` (0 for the
blank, 기타, 미분류 and 미지정 rows so they draw under the detailed zones, 1 otherwise, 2 for 개발제한구역), `dyear`,
`dnum`, `sido_name` and `sigg_name`. The 210 blank-named 도시지역 polygons are mostly outer 도시지역 extents (95% of
their area lies under named zones), so they stay as "도시지역(세부 미분류)" and draw underneath.
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from datetime import date
from pathlib import Path

import geopandas as gpd
import pandas as pd
import shapely
from shapely.geometry import MultiPolygon
from shapely.geometry.base import BaseGeometry

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "region_registry"))
from build_release_pmtiles import write_pmtiles  # noqa: E402

RAW = REPO_ROOT / "data" / "raw" / "vworld" / "zoning-api-20261030"
RECEIPT = REPO_ROOT / "data" / "manifests" / "vworld-data-api-20261030.json"
OUT = REPO_ROOT / "dist" / "zoning"
FILE = "kr-zoning.pmtiles"
MINZOOM, MAXZOOM = 9, 14  # z7–8 tiles hit the tile size limit and drop up to 40% of the area
# VWorld dataset, kind, label for blank uname
DATASETS = [
    ("LT_C_UQ111", "urban", "도시지역(세부 미분류)"),
    ("LT_C_UQ112", "management", "관리지역(미분류)"),
    ("LT_C_UQ113", "agri", "농림지역"),
    ("LT_C_UQ114", "conservation", "자연환경보전지역"),
    ("LT_C_UD801", "gb", "개발제한구역"),
]
COARSE = ("기타", "미분류", "미지정")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def polygon_parts(geom: BaseGeometry) -> BaseGeometry | None:
    """make_valid can return a collection with stray lines or points; keep the polygons."""
    polygons = [p for p in shapely.get_parts(shapely.get_parts(geom)) if p.geom_type == "Polygon" and not p.is_empty]
    if not polygons:
        return None
    return polygons[0] if len(polygons) == 1 else MultiPolygon(polygons)


def read_dataset(name: str, kind: str, blank_label: str, receipt: dict) -> gpd.GeoDataFrame:
    entry = receipt["harvests"]["zoning-api-20261030"]["datasets"][name]
    features = []
    for f in entry["files"]:
        path = RAW / name / f["file"]
        if not path.exists() or sha256(path) != f["sha256"]:
            raise SystemExit(f"{name}/{f['file']}: missing or differs from the receipt")
        features += json.loads(path.read_text(encoding="utf-8"))["features"]
    if len(features) != entry["reported_total"]:
        raise SystemExit(f"{name}: {len(features)} features, VWorld reported {entry['reported_total']}")
    g = gpd.GeoDataFrame.from_features(features, crs=4326)
    g.insert(0, "zid", [f["id"] for f in features])
    g["uname"] = g["uname"].fillna("").str.strip()
    blank = g["uname"] == ""
    g["name"] = g["uname"].where(~blank, blank_label)
    g["kind"] = kind
    g["rank"] = 2 if kind == "gb" else (~(blank | g["uname"].str.contains("|".join(COARSE)))).astype(int)
    return g


def main() -> None:
    started = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))
    frames, stats = [], {}
    for name, kind, blank_label in DATASETS:
        g = read_dataset(name, kind, blank_label, receipt)
        invalid = int((~g.is_valid).sum())
        g["geometry"] = g.geometry.make_valid().apply(polygon_parts)
        g = g[g.geometry.notna()]
        area = g.to_crs(5179).area / 1e6
        counts, areas = g.groupby("name").size(), area.groupby(g["name"]).sum()
        stats[name] = {"kind": kind, "features": len(g), "repaired": invalid, "km2": round(float(area.sum()), 1),
                       "names": {k: [int(counts[k]), round(float(areas[k]), 1)] for k in counts.index}}
        print(f"{name}: {len(g):,} features, {invalid:,} repaired, {area.sum():,.0f} km2", flush=True)
        frames.append(g[["zid", "kind", "uname", "name", "rank", "dyear", "dnum", "sido_name", "sigg_name", "geometry"]])

    zoning = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=4326)
    if zoning.zid.duplicated().any():
        raise SystemExit("a VWorld feature id appears twice")
    path = OUT / FILE
    path.unlink(missing_ok=True)
    write_pmtiles(zoning, path, "zoning", {"MINZOOM": str(MINZOOM), "MAXZOOM": str(MAXZOOM), "NAME": "kr-zoning"})
    size = path.stat().st_size
    print(f"{FILE}: {len(zoning):,} features, {size / 1e6:.1f} MB, {time.time() - started:.0f}s", flush=True)

    manifest = {
        "built": date.today().isoformat(),
        "source": "VWorld 2D 데이터 API 2.0 (국토교통부 용도지역지구), data/manifests/vworld-data-api-20261030.json",
        "license": "출처: 국토교통부 용도지역지구정보(VWorld 2D 데이터 API). 법적 효력이 없는 참고용 정보입니다.",
        "tiles": {FILE: {"bytes": size, "sha256": sha256(path), "tile_layer": "zoning", "minzoom": MINZOOM,
                         "maxzoom": MAXZOOM, "features": len(zoning), "datasets": stats}},
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    notes = [
        "# 용도지역·개발제한구역 (전국, 2026-10-30 수집)", "",
        "Atlas KR 지도 레이어 `planning/zoning`의 벡터 타일입니다. VWorld 2D 데이터 API로 받은 국토교통부 용도지역지구 도형입니다.", "",
        "| VWorld 자료 | 구분 | 도형 수 | 면적(km²) | 고친 도형 |", "|---|---|---|---|---|",
        *[f"| `{k}` | {v['kind']} | {v['features']:,} | {v['km2']:,.0f} | {v['repaired']:,} |" for k, v in stats.items()],
        "",
        f"- 파일: `{FILE}` ({size / 1e6:.0f} MB), 타일 레이어 `zoning`, z{MINZOOM}–{MAXZOOM}. 좌표계 EPSG:3857.",
        "- 속성: `zid`(VWorld 도형 id), `kind`(urban·management·agri·conservation·gb), `uname`(VWorld 용도지역명), `name`(표시 이름), "
        "`rank`(0 미분류·기타, 1 세부 용도지역, 2 개발제한구역), `dyear`·`dnum`(고시년도·번호, 0000은 미상), `sido_name`, `sigg_name`.",
        "- 도시지역 중 이름이 빈 도형 210개는 대부분 도시지역 바깥 경계(면적의 95%가 세부 용도지역과 겹침)라서 '도시지역(세부 미분류)'로 두고 아래에 그립니다.",
        "- 잘못된 도형은 make_valid로 고쳤습니다. 면적은 EPSG:5179 기준이며 자료끼리 겹치는 부분(개발제한구역 등)이 있어 합계가 국토 면적과 다릅니다.",
        "- 행정구역 경계와 맞지 않습니다. 도시지역 도형 면적의 2.4%가 2025-12-31 시군구 경계 기준으로 이웃 시군구에 걸치고, `sigg_name`은 시 단위·수집일 현재 이름이라 85%만 실제 위치와 같습니다. 지역별 집계에는 `sigg_name` 대신 경계와 겹쳐 면적 비율로 나누십시오.",
        "- 라이선스: VWorld 페이지에는 라이선스 지정이 없고, data.go.kr의 같은 연속주제도는 공공누리 제4유형(출처표시·상업적 이용금지·변경금지)입니다. 자세한 내용은 저장소 `layers/providers/vworld-zoning/README.md`.",
        "", "출처: 국토교통부 용도지역지구정보(VWorld). 정보 제공용이며 법적 효력이 없습니다. "
        "Atlas KR 앱은 `/api/layers/vworld-zoning/zoning/<z>/<x>/<y>.pbf`로 이 파일을 읽어 줍니다.",
    ]
    (OUT / "RELEASE_NOTES.md").write_text("\n".join(notes) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
