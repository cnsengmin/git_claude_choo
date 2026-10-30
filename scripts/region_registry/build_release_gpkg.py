#!/usr/bin/env python3
"""Boundary GeoPackages of every region layer, for a GitHub Release (design v2.1 decision 3;
plan P8). Too large for the repository; the files go to dist/ (gitignored).

    python scripts/region_registry/build_release_gpkg.py [--levels lgu sgg admdong]
    gh release create region-layers-<date> dist/region-layers/* --notes-file dist/region-layers/RELEASE_NOTES.md

One file per level, one table per layer date (e.g. lgu_20251231). Each unit takes its polygon
from the layer's boundary version (layer_boundaries.csv); a unit that version does not draw yet
takes the nearest version that does (`polygon_version`), and the 5 northern myeon that no
version draws keep a row without geometry. Attributes: MOIS 10/5-digit code, name, sido,
KOSTAT code of the layer (code_map_layers.csv), parent lgu for general-gu and dongs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

import geopandas as gpd
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_crosswalk import U, boundary, lgu_of, polygons  # noqa: E402  (same boundary cache and rules)

REPO_ROOT = Path(__file__).resolve().parents[2]
REG = REPO_ROOT / "data" / "derived" / "region-registry"
OUT = REPO_ROOT / "dist" / "region-layers"


def kostat_codes(level: str) -> dict[tuple[str, str], str]:
    if level == "admdong":
        cm = pd.read_parquet(REG / "code_map_layers_admdong.parquet").rename(columns={"mois": "mois_code"})
    else:
        cm = pd.read_csv(REG / "code_map_layers.csv", dtype=str)
    cm = cm[cm.layer_id.str.startswith(f"kr-{level}@")]
    one = cm.groupby(["layer_id", "mois_code"]).kostat_final.agg(lambda s: s.iloc[0] if s.nunique() == 1 else "")
    return one.to_dict()


def layer_frame(level: str, layer_id: str, version: str, members: list[str], kostat: dict) -> gpd.GeoDataFrame:
    b = boundary(version, level)
    g = b[b.code.isin(members)][["code", "geometry"]].assign(polygon_version=version)
    missing = sorted(set(members) - set(g.code))
    if missing:
        extra, used = polygons(frozenset(missing), level, version, "before")
        extra = extra[extra.code.isin(missing)][["code", "geometry"]]
        g = pd.concat([g, extra.assign(polygon_version=extra.code.map(used))], ignore_index=True)
    g = gpd.GeoDataFrame(pd.DataFrame({"code": members}).merge(g, on="code", how="left"), geometry="geometry", crs="EPSG:5179")
    g["polygon_version"] = g.polygon_version.fillna("")
    g.insert(1, "code5", g.code.str[:5])
    g.insert(2, "name", g.code.map(U["name"]))
    g.insert(3, "sido_name", g.code.map(U.sido_name))
    g.insert(4, "kostat", [kostat.get((layer_id, c), "") for c in g.code])
    g.insert(5, "lgu_code", g.code.map(lgu_of).fillna(""))
    g["layer_id"], g["boundary_version"] = layer_id, version
    g["area_m2"] = g.geometry.area.round(1)
    return g


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--levels", nargs="*", default=["lgu", "sgg", "admdong"])
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    lb = pd.read_csv(REG / "layer_boundaries.csv", dtype=str).set_index("layer_id")
    layers = pd.read_csv(REG / "layers.csv", dtype=str)
    m = pd.read_parquet(REG / "layer_units.parquet")
    files = {}
    for level in args.levels:
        path = OUT / f"kr-region-layers-{level}.gpkg"
        path.unlink(missing_ok=True)
        kostat = kostat_codes(level)
        stats = []
        for lid, d in layers[layers.level == level][["layer_id", "reference_date"]].values:
            members = sorted(m[m.layer_id == lid].code)
            g = layer_frame(level, lid, lb.loc[lid, "boundary_version"], members, kostat)
            g.to_file(path, layer=f"{level}_{d.replace('-', '')}", driver="GPKG")
            stats.append({"layer": lid, "units": len(g), "no_polygon": int(g.geometry.isna().sum()),
                          "other_version": int(((g.polygon_version != "") & (g.polygon_version != g.boundary_version)).sum())})
            print(stats[-1], flush=True)
        files[path.name] = {"bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "layers": stats}

    manifest_path = OUT / "manifest.json"
    previous = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    old = previous.get("files", {})
    manifest = {
        "built": date.today().isoformat(), "crs": "EPSG:5179",
        "built_from": {"registry": "data/derived/region-registry", "boundaries": "vuski/admdongkor (SGIS, KOGL Type 1), cached in data/raw/admdongkor"},
        "license": "CC BY 4.0. 출처: 통계청 SGIS 행정구역 경계(공공누리 제1유형), 가공 vuski/admdongkor (CC BY 4.0), 단위·코드 행정안전부.",
        "files": {**old, **files},
        # Written by build_release_pmtiles.py, which also re-adds its section to the notes.
        **({"tiles": previous["tiles"]} if "tiles" in previous else {}),
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    notes = [
        "# 행정구역 시점별 레이어 경계 (GeoPackage)", "",
        "Atlas KR 지역 레이어 `kr-{lgu|sgg|admdong}@YYYY-MM-DD`(2008–2025 연말, 2026-10-01)의 경계입니다. "
        "파일 하나에 수준 하나, 레이어 날짜마다 테이블 하나(예: `lgu_20251231`). 좌표계 EPSG:5179.", "",
        "| 파일 | 크기 | 레이어 | 다른 판 경계 | 경계 없음 |", "|---|---|---|---|---|",
    ]
    for k, v in manifest["files"].items():
        print(f"{v['bytes'] / 1e6:8.1f} MB  {k}")
        notes.append(f"| `{k}` | {v['bytes'] / 1e6:.0f} MB | {len(v['layers'])} | "
                     f"{sum(s['other_version'] for s in v['layers'])} | {sum(s['no_polygon'] for s in v['layers'])} |")
    notes += [
        "", "- 열: `code`(행안부 10자리), `code5`, `name`, `sido_name`, `kostat`(그 레이어의 통계청 코드), `lgu_code`(소속 기초 단위), "
        "`boundary_version`(레이어 경계판), `polygon_version`(실제로 쓴 판), `area_m2`.",
        "- 레이어 경계판에 아직 없는 단위는 가장 가까운 판의 경계를 씁니다(`polygon_version` ≠ `boundary_version`). "
        "북쪽 접경 5개 면은 2023년 강원 코드 변경 뒤로 그린 판이 없어 경계 없이 남습니다.",
        "- 연결표와 패키지: 저장소 `packages/kr-sgg-crosswalk/`(v0.3), `data/derived/region-registry/crosswalk/`.",
        "- SHA-256: 함께 올린 `manifest.json`.", "",
        "출처: 통계청 SGIS 행정구역 경계(공공누리 제1유형), 가공 vuski/admdongkor(CC BY 4.0), 단위·코드 행정안전부. 이 파일: CC BY 4.0.",
    ]
    (OUT / "RELEASE_NOTES.md").write_text("\n".join(notes) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
