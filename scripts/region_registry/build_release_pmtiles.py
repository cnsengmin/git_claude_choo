#!/usr/bin/env python3
"""Vector tiles (PMTiles) of every region layer for the map, from the release GeoPackages
(layer module stage 2: layers/boundaries/admin-*). Run build_release_gpkg.py first.

    python scripts/region_registry/build_release_pmtiles.py [--levels lgu sgg admdong sido]
    gh release upload region-layers-<date> dist/region-layers/*.pmtiles dist/region-layers/manifest.json

One file per level with one tile layer named after the level. All layer dates share the
file: each feature is one unit on one layer date and carries a flag per date it belongs to
(d2008 … d2025 for year-ends, d202610 for 2026-10-01), so the map filters by date. Units
without a polygon (5 northern myeon) are left out. Sido boundaries have no GeoPackage of their
own: each date's lgu units are merged by MOIS sido code (sido_from_lgu). The app serves the tiles through
/api/layers/region-layers/<level>/<z>/<x>/<y>.pbf (layers/providers/region-layers).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import warnings
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio
from shapely.geometry import MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT = REPO_ROOT / "dist" / "region-layers"
ATTRS = ["code", "code5", "name", "sido_name", "kostat", "lgu_code"]
ZOOMS = {"lgu": (4, 12), "sgg": (5, 12), "admdong": (8, 12), "sido": (4, 10)}
# Largest compressed tile GDAL may write before it starts dropping features.
MAX_TILE_BYTES = 2_000_000
NOTES_START, NOTES_END = "<!-- pmtiles -->", "<!-- /pmtiles -->"


def write_pmtiles(g: gpd.GeoDataFrame, path: Path, layer: str, options: dict[str, str]) -> None:
    """Write one tile layer. SIMPLIFICATION and MAX_SIZE are dataset options: GDAL only warns
    about layer options it ignores, and its default MAX_SIZE (500 KB per compressed tile)
    silently drops features from dense low-zoom tiles, so ignored options stop the build."""
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        pyogrio.write_dataframe(g, path, driver="PMTiles", layer=layer,
                                dataset_options={"SIMPLIFICATION": "1", "MAX_SIZE": str(MAX_TILE_BYTES), **options})
    ignored = [str(w.message) for w in caught if "does not support" in str(w.message)]
    if ignored:
        raise SystemExit(f"{path.name}: {ignored[0]}")


def date_flag(table: str) -> str:
    """lgu_20251231 -> d2025, lgu_20261001 -> d202610 (layer dates are year-ends plus 2026-10-01)."""
    ymd = table.rsplit("_", 1)[1]
    return f"d{ymd[:4]}" if ymd[4:] == "1231" else f"d{ymd[:6]}"


def fill_slivers(geom: BaseGeometry, max_hole_m2: float = 10_000) -> BaseGeometry:
    """Drop holes under 1 ha left between lgu polygons drawn from different boundary versions
    (up to 4,374 per date before 2012). Real enclaves, such as a metropolitan city inside its
    province, are far larger and stay."""
    polygons = getattr(geom, "geoms", [geom])
    kept = [Polygon(p.exterior, [r for r in p.interiors if Polygon(r).area >= max_hole_m2]) for p in polygons]
    return MultiPolygon(kept) if len(kept) > 1 else kept[0]


def sido_from_lgu(lgu: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Sido units of one layer date: lgu units merged by the first two digits of their MOIS
    code (the sido part of the same 10-digit MOIS code, not a KOSTAT conversion). Each prefix
    must carry one sido name on that date."""
    g = lgu.assign(prefix=lgu.code.str[:2])
    names = g.groupby("prefix").sido_name.nunique()
    if (names != 1).any():
        raise SystemExit(f"sido prefix with several names: {names[names != 1].to_dict()}")
    merged = g.assign(geometry=g.geometry.make_valid()).dissolve(by="prefix", aggfunc={"sido_name": "first"}).reset_index()
    merged["geometry"] = merged.geometry.apply(fill_slivers)
    return gpd.GeoDataFrame({
        "code": merged.prefix + "00000000", "code5": merged.prefix + "000", "name": merged.sido_name,
        "sido_name": merged.sido_name, "kostat": "", "lgu_code": "",
    }, geometry=merged.geometry, crs=lgu.crs)


def level_frame(level: str) -> tuple[gpd.GeoDataFrame, list[str]]:
    src = OUT / f"kr-region-layers-{'lgu' if level == 'sido' else level}.gpkg"
    frames, flags = [], []
    for table, _ in pyogrio.list_layers(src):
        flag = date_flag(table)
        flags.append(flag)
        g = gpd.read_file(src, layer=table, columns=ATTRS)
        g = g[g.geometry.notna()]
        frames.append((sido_from_lgu(g) if level == "sido" else g).assign(flag=flag))
    g = pd.concat(frames, ignore_index=True)
    marks = pd.get_dummies(g.flag).reindex(columns=flags, fill_value=False).astype("int8")
    g = gpd.GeoDataFrame(pd.concat([g[ATTRS], marks, g[["geometry"]]], axis=1), geometry="geometry", crs=frames[0].crs)
    return g.to_crs(4326), flags


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--levels", nargs="*", default=["lgu", "sgg", "admdong"])
    args = ap.parse_args()
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tiles = manifest.get("tiles", {})
    for level in args.levels:
        started = time.time()
        g, flags = level_frame(level)
        path = OUT / f"kr-region-layers-{level}.pmtiles"
        path.unlink(missing_ok=True)
        minzoom, maxzoom = ZOOMS[level]
        write_pmtiles(g, path, level, {"MINZOOM": str(minzoom), "MAXZOOM": str(maxzoom), "NAME": f"kr-region-layers-{level}"})
        tiles[path.name] = {
            "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "tile_layer": level, "minzoom": minzoom, "maxzoom": maxzoom, "features": len(g), "date_flags": flags,
        }
        print(f"{level}: {len(g)} features, {path.stat().st_size / 1e6:.1f} MB, {time.time() - started:.0f}s", flush=True)

    manifest["tiles"] = tiles
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")

    section = [
        NOTES_START, "", "## 지도용 벡터 타일 (PMTiles)", "",
        "| 파일 | 크기 | 확대 단계 | 지역×시점 |", "|---|---|---|---|",
        *[f"| `{k}` | {v['bytes'] / 1e6:.0f} MB | z{v['minzoom']}–{v['maxzoom']} | {v['features']:,} |" for k, v in tiles.items()],
        "",
        "- 타일 레이어 이름은 수준(`lgu`, `sgg`, `admdong`, `sido`), 좌표계 EPSG:3857. 속성: `code`, `code5`, `name`, `sido_name`, `kostat`, `lgu_code`.",
        "- 시도(`sido`)는 따로 그린 경계가 아니라 시점마다 기초 단위를 행안부 시도 코드(10자리 코드의 앞 두 자리)로 합친 것입니다. 1ha 미만의 틈 구멍은 메웠고, 통계청 코드는 비어 있습니다.",
        "- 모든 시점이 한 파일에 있고, 지역마다 속한 시점 표시(`d2008`…`d2025`, 2026-10-01은 `d202610`)가 1입니다. 지도는 고른 시점으로 걸러 그립니다.",
        "- 경계가 없는 북쪽 접경 5개 면은 빠집니다. Atlas KR 앱은 `/api/layers/region-layers/<수준>/<z>/<x>/<y>.pbf`로 이 파일을 읽어 줍니다.",
        "", NOTES_END,
    ]
    notes_path = OUT / "RELEASE_NOTES.md"
    notes = notes_path.read_text(encoding="utf-8")
    notes = re.sub(rf"\n?{re.escape(NOTES_START)}.*?{re.escape(NOTES_END)}\n?", "\n", notes, flags=re.S).rstrip("\n")
    notes_path.write_text(notes + "\n\n" + "\n".join(section) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
