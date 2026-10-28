#!/usr/bin/env python3
"""Vector tiles (PMTiles) of every region layer for the map, from the release GeoPackages
(layer module stage 2: layers/boundaries/admin-*). Run build_release_gpkg.py first.

    python scripts/region_registry/build_release_pmtiles.py [--levels lgu sgg admdong]
    gh release upload region-layers-<date> dist/region-layers/*.pmtiles dist/region-layers/manifest.json

One file per level with one tile layer named after the level. All layer dates share the
file: each feature is one unit on one layer date and carries a flag per date it belongs to
(d2008 … d2025 for year-ends, d202610 for 2026-10-01), so the map filters by date. Units
without a polygon (5 northern myeon) are left out. The app serves the tiles through
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

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT = REPO_ROOT / "dist" / "region-layers"
ATTRS = ["code", "code5", "name", "sido_name", "kostat", "lgu_code"]
ZOOMS = {"lgu": (4, 12), "sgg": (5, 12), "admdong": (8, 12)}
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


def level_frame(level: str) -> tuple[gpd.GeoDataFrame, list[str]]:
    src = OUT / f"kr-region-layers-{level}.gpkg"
    frames, flags = [], []
    for table, _ in pyogrio.list_layers(src):
        flag = date_flag(table)
        flags.append(flag)
        g = gpd.read_file(src, layer=table, columns=ATTRS)
        frames.append(g[g.geometry.notna()].assign(flag=flag))
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
        "- 타일 레이어 이름은 수준(`lgu`, `sgg`, `admdong`), 좌표계 EPSG:3857. 속성: `code`, `code5`, `name`, `sido_name`, `kostat`, `lgu_code`.",
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
