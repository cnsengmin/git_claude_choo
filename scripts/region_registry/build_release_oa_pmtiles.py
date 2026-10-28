#!/usr/bin/env python3
"""Vector tiles (PMTiles) of census population on 2025 output areas (집계구), for the map
layer people/population-oa (layer module stage 3).

    python scripts/region_registry/build_release_oa_pmtiles.py
    gh release create oa-population-<date> dist/oa-population/* --notes-file dist/oa-population/RELEASE_NOTES.md

Input: data/raw/sgis/oa-2025 (SGIS 2025 output-area boundaries and the 2015 / 2020 / 2024
census population on the same output-area codes; data/manifests/sgis-oa-2025.json).
Each feature carries p<year> (persons) and dn<year> (persons per km² of the output area).
N/A cells stay absent: in 2024 they mean no residents, in 2015 and 2020 they also hide small
counts, so they are never written as 0. The script checks the population sums against the
receipts in the manifest before writing the release notes.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from datetime import date
from pathlib import Path

import geopandas as gpd
import pandas as pd
from build_release_pmtiles import write_pmtiles

REPO_ROOT = Path(__file__).resolve().parents[2]
OA = REPO_ROOT / "data" / "raw" / "sgis" / "oa-2025"
RECEIPT = REPO_ROOT / "data" / "manifests" / "sgis-oa-2025.json"
OUT = REPO_ROOT / "dist" / "oa-population"
YEARS = [2015, 2020, 2024]
MINZOOM, MAXZOOM = 10, 14
FILE = "kr-oa-population.pmtiles"


def expected_sums() -> dict[int, int]:
    """Output-area population sums recorded when the data was fetched."""
    receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))
    number = lambda text, pattern: int(re.search(pattern, text).group(1).replace(",", ""))
    past = receipt["past_census_stats"]["years"]
    return {
        2015: number(past["2015"]["vs_kosis_census"]["population"], r"output-area sum ([\d,]+)"),
        2020: number(past["2020"]["vs_kosis_census"]["population"], r"output-area sum ([\d,]+)"),
        2024: number(receipt["validation"]["vs_kosis_2024_census"]["population"], r"^([\d,]+)"),
    }


def main() -> None:
    started = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    g = gpd.read_file(OA / "oa_2025.gpkg", columns=["oa_cd", "emd_cd", "adm_nm", "sgg_nm", "sido_nm"])
    g["oa_cd"] = g.oa_cd.astype(str)
    area_km2 = g.geometry.area / 1e6

    stats, expected = {}, expected_sums()
    for year in YEARS:
        s = pd.read_csv(OA / f"oa_stats_{year}.csv", dtype=str, usecols=["adm_cd", "tot_ppltn"])
        pop = g.oa_cd.map(dict(zip(s.adm_cd, pd.to_numeric(s.tot_ppltn.replace("N/A", None), errors="coerce"))))
        g[f"p{year}"] = pop.astype("Int64")
        g[f"dn{year}"] = (pop / area_km2).round().astype("Int64")
        total = int(pop.sum())
        stats[year] = {"sum": total, "na_cells": int(pop.isna().sum()), "expected_sum": expected[year]}
        if total != expected[year]:
            raise SystemExit(f"{year}: output-area sum {total:,} differs from the receipt {expected[year]:,}")
        print(f"{year}: sum {total:,} (= receipt), N/A cells {stats[year]['na_cells']:,}", flush=True)

    path = OUT / FILE
    path.unlink(missing_ok=True)
    write_pmtiles(g.to_crs(4326), path, "oa", {"MINZOOM": str(MINZOOM), "MAXZOOM": str(MAXZOOM), "NAME": "kr-oa-population"})
    size = path.stat().st_size
    print(f"{FILE}: {len(g):,} output areas, {size / 1e6:.1f} MB, {time.time() - started:.0f}s", flush=True)

    manifest = {
        "built": date.today().isoformat(),
        "source": "SGIS OpenAPI3 boundary/statsarea (2025) + stats/population (2015, 2020, 2024), data/manifests/sgis-oa-2025.json",
        "license": "공공누리 제1유형(출처표시). 출처: 통계청 SGIS 집계구 경계·인구총조사 통계.",
        "tiles": {FILE: {"bytes": size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "tile_layer": "oa",
                         "minzoom": MINZOOM, "maxzoom": MAXZOOM, "features": len(g), "years": stats}},
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    notes = [
        "# 집계구 인구 (2015·2020·2024, 2025 집계구 경계)", "",
        "Atlas KR 지도 레이어 `people/population-oa`의 벡터 타일입니다. 통계청 SGIS 2025 집계구 경계 위에 인구총조사 인구를 얹었습니다.", "",
        "| 연도 | 집계구 합 | 값 없음(N/A) 집계구 |", "|---|---|---|",
        *[f"| {y} | {v['sum']:,} | {v['na_cells']:,} |" for y, v in stats.items()],
        "",
        f"- 파일: `{FILE}` ({size / 1e6:.0f} MB), 타일 레이어 `oa`, z{MINZOOM}–{MAXZOOM}, 집계구 {len(g):,}개. 좌표계 EPSG:3857.",
        "- 속성: `oa_cd`(집계구), `emd_cd`(읍면동), `adm_nm`, `sgg_nm`, `sido_nm`, `p<연도>`(인구), `dn<연도>`(인구밀도, 명/㎢, 집계구 면적 기준).",
        "- N/A 칸은 값을 비워 둡니다(0으로 바꾸지 않음). 2024년 N/A는 거주자 없음이고, 2015·2020년 N/A에는 작은 값을 가린 칸도 섞여 있어 집계구 합이 읍면동 총계보다 2015년 2,706명, 2020년 1,027명 적습니다.",
        "- 읍면동 총계는 KOSIS DT_1IN1502와 같습니다(2015 51,069,375, 2020 51,829,136, 2024 51,805,547).",
        "", "출처: 통계청 SGIS 집계구 경계·인구총조사(공공누리 제1유형). Atlas KR 앱은 `/api/layers/sgis-oa/<z>/<x>/<y>.pbf`로 이 파일을 읽어 줍니다.",
    ]
    (OUT / "RELEASE_NOTES.md").write_text("\n".join(notes) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
