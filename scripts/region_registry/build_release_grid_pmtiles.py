#!/usr/bin/env python3
"""Vector tiles (PMTiles) of SGIS 100 m grid statistics, for the map layer
people/population-100m (layer module stage 4).

    python scripts/region_registry/build_release_grid_pmtiles.py
    gh release create grid-100m-<date> dist/grid-100m/* --notes-file dist/grid-100m/RELEASE_NOTES.md

Input: data/raw/sgis/grid/100m/<theme>/<year>/*.csv from SGIS 자료신청 90231
(data/manifests/sgis-request-90231.json). The CSVs have no header, cp949 text and one row per
cell and item: year, grid code (e.g. 다사526528), item code, value. Every file is checked
against the SHA-256 in the receipt before use.

The cell square comes from the code itself: two letters pick the 100 km box (x from 가 = 700000,
y from 가 = 1300000, EPSG:5179), then three digits each give x and y in 100 m steps.
Each feature carries `cell` and, where SGIS lists the cell for that year, p<year> (population,
2015–2024), h<year> (households), u<year> (dwellings), b<year> (businesses) and w<year>
(workers) for 2015, 2020 and 2024. A cell missing from a year's files stays absent, never 0.
SGIS protects small values (no value is 1–4; 5, 8 and 13 are frequent), so the grid sums run
about 2% above census totals; the build compares the written sums with the raw files.
"""

from __future__ import annotations

import hashlib
import json
import time
from datetime import date
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from build_release_pmtiles import write_pmtiles

REPO_ROOT = Path(__file__).resolve().parents[2]
SGIS = REPO_ROOT / "data" / "raw" / "sgis"
RECEIPT = REPO_ROOT / "data" / "manifests" / "sgis-request-90231.json"
OUT = REPO_ROOT / "dist" / "grid-100m"
MINZOOM, MAXZOOM = 11, 14
FILE = "kr-grid-100m.pmtiles"
# folder under grid/100m, item code, attribute prefix, years
THEMES = [
    ("인구", "to_in_001", "p", list(range(2015, 2025))),
    ("가구", "to_ga_001", "h", [2015, 2020, 2024]),
    ("주택", "to_ho_001", "u", [2015, 2020, 2024]),
    ("사업체", "to_fa_010", "b", [2015, 2020, 2024]),
    ("종사자", "to_em_020", "w", [2015, 2020, 2024]),
]
LETTERS = "가나다라마바사아"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def checked_files() -> dict[str, Path]:
    """Grid CSVs listed in the receipt, each matching its recorded hash."""
    receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))
    files = {}
    for entry in receipt["files"]:
        if not entry["path"].startswith("grid/100m/"):
            continue
        path = SGIS / entry["path"]
        if not path.exists() or sha256(path) != entry["sha256"]:
            raise SystemExit(f"{entry['path']}: missing or differs from the receipt")
        files[entry["path"]] = path
    return files


def read_year(paths: list[Path], item: str) -> pd.Series:
    frames = [pd.read_csv(p, header=None, names=["year", "cell", "item", "value"], dtype=str, encoding="cp949") for p in paths]
    df = pd.concat(frames, ignore_index=True)
    df = df[df["item"] == item]
    if df.cell.duplicated().any():
        raise SystemExit(f"{item}: a cell appears twice")
    return pd.Series(pd.to_numeric(df.value, errors="raise").astype("int64").values, index=df.cell.values)


def cell_squares(cells: pd.Index) -> np.ndarray:
    codes = cells.to_numpy(dtype=str)
    if not all(len(c) == 8 and c[0] in LETTERS and c[1] in LETTERS and c[2:].isdigit() for c in codes):
        raise SystemExit("unexpected grid code")
    x = np.array([700_000 + LETTERS.index(c[0]) * 100_000 + int(c[2:5]) * 100 for c in codes])
    y = np.array([1_300_000 + LETTERS.index(c[1]) * 100_000 + int(c[5:8]) * 100 for c in codes])
    return shapely.box(x, y, x + 100, y + 100)


def main() -> None:
    started = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    files = checked_files()

    columns, stats = {}, {}
    for folder, item, prefix, years in THEMES:
        for year in years:
            paths = [p for rel, p in files.items() if rel.startswith(f"grid/100m/{folder}/{year}/")]
            if not paths:
                raise SystemExit(f"no files for {folder} {year}")
            values = read_year(paths, item)
            columns[f"{prefix}{year}"] = values
            stats[f"{prefix}{year}"] = {"theme": folder, "year": year, "files": len(paths), "cells": len(values),
                                        "sum": int(values.sum()), "zero_cells": int((values == 0).sum())}
            print(f"{folder} {year}: {len(paths)} files, {len(values):,} cells, sum {values.sum():,}", flush=True)

    table = pd.DataFrame(columns).astype("Int64")
    table.index.name = "cell"
    for key, s in stats.items():
        written = table[key]
        if int(written.notna().sum()) != s["cells"] or int(written.sum()) != s["sum"]:
            raise SystemExit(f"{key}: written cells or sum differ from the raw files")

    g = gpd.GeoDataFrame(table.reset_index(), geometry=cell_squares(table.index), crs=5179)
    path = OUT / FILE
    path.unlink(missing_ok=True)
    write_pmtiles(g.to_crs(4326), path, "grid", {"MINZOOM": str(MINZOOM), "MAXZOOM": str(MAXZOOM), "NAME": "kr-grid-100m"})
    size = path.stat().st_size
    print(f"{FILE}: {len(g):,} cells, {size / 1e6:.1f} MB, {time.time() - started:.0f}s", flush=True)

    manifest = {
        "built": date.today().isoformat(),
        "source": "SGIS 자료신청 90231 (100m 격자 통계), data/manifests/sgis-request-90231.json",
        "license": "공공누리 제1유형(출처표시). 출처: 국가데이터처 SGIS 격자 통계(인구주택총조사·전국사업체조사).",
        "tiles": {FILE: {"bytes": size, "sha256": sha256(path), "tile_layer": "grid", "minzoom": MINZOOM,
                         "maxzoom": MAXZOOM, "features": len(g), "columns": stats}},
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    notes = [
        "# 100m 격자 통계 (인구 2015–2024, 가구·주택·사업체·종사자 2015·2020·2024)", "",
        "Atlas KR 지도 레이어 `people/population-100m`의 벡터 타일입니다. 국가데이터처 SGIS 100m 격자 통계를 격자 코드에서 계산한 정사각형에 얹었습니다.", "",
        "| 속성 | 주제 | 연도 | 격자 수 | 합계 | 0인 격자 |", "|---|---|---|---|---|---|",
        *[f"| `{k}` | {v['theme']} | {v['year']} | {v['cells']:,} | {v['sum']:,} | {v['zero_cells']:,} |" for k, v in stats.items()],
        "",
        f"- 파일: `{FILE}` ({size / 1e6:.0f} MB), 타일 레이어 `grid`, z{MINZOOM}–{MAXZOOM}, 격자 {len(g):,}개. 좌표계 EPSG:3857.",
        "- 속성: `cell`(격자 코드), `p<연도>`(인구), `h<연도>`(가구), `u<연도>`(주택), `b<연도>`(사업체), `w<연도>`(종사자). 그 해 자료에 없는 격자는 속성을 비워 둡니다(0으로 바꾸지 않음).",
        "- SGIS는 작은 값을 비밀보호 처리합니다. 1–4인 값이 없고 5·8·13이 많아서, 격자 인구 합계가 인구총조사 총인구보다 2% 안팎 큽니다. 격자 값은 분포를 보는 데 쓰고, 지역 합계는 집계구·행정구역 통계를 쓰십시오.",
        "- 사업체·종사자는 SGIS가 100km 구역 '라다' 파일을 주지 않아 29개 구역입니다(인구·가구·주택은 30개).",
        "", "출처: 국가데이터처 SGIS 격자 통계(공공누리 제1유형). Atlas KR 앱은 `/api/layers/sgis-grid/grid/<z>/<x>/<y>.pbf`로 이 파일을 읽어 줍니다.",
    ]
    (OUT / "RELEASE_NOTES.md").write_text("\n".join(notes) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
