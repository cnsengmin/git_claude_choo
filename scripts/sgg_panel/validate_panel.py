#!/usr/bin/env python3
"""Checks for the 2008-2025 sigungu panel (layer stage 3a).

    python scripts/sgg_panel/validate_panel.py

1. Every series, year and variable: unit sum = KOSIS national row, panel sum = unit sum, no
   2025 base unit missing, a city's own row = the sum of its general-gu rows.
2. 2025 values = the 2025 single-year table (data/derived/sgg2025/lgu229_2025.csv).
3. Boundary changes land where the crosswalk says: Sejong (2012), Cheongju-Cheongwon (2014),
   Michuhol rename mid-2018, Gunwi moving to Daegu (2023).
Prints one line per check and exits 1 on any failure.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
PANEL = ROOT / "data" / "derived" / "sgg-panel"
RAW = ROOT / "data" / "raw" / "kosis" / "sgg-panel"
TABLE_2025 = ROOT / "data" / "derived" / "sgg2025" / "lgu229_2025.csv"

results: list[tuple[bool, str]] = []


def check(ok: bool, message: str) -> None:
    results.append((bool(ok), message))


def value(panel: pd.DataFrame, code: str, year: int, variable: str) -> float:
    row = panel[(panel.lgu_code == code) & (panel.year == year)]
    return float(row[variable].iloc[0]) if len(row) else float("nan")


def raw_value(series: str, year: int, item: str, code: str) -> float:
    rows = json.loads((RAW / f"{series}_{year}.json").read_text(encoding="utf-8"))
    return sum(float(r["DT"]) for r in rows if r["ITM_ID"] == item and str(r["C1"]).strip() == code)


def main() -> None:
    panel = pd.read_csv(PANEL / "lgu229_panel.csv", dtype={"lgu_code": str})
    checks = pd.read_csv(PANEL / "panel_check.csv", keep_default_na=False)
    for column in ("kosis_national", "units_sum", "panel_sum", "city_vs_gu_max_gap"):
        checks[column] = pd.to_numeric(checks[column], errors="coerce")

    # 1. totals and coverage
    off_national = checks[(checks.units_sum - checks.kosis_national).abs() > 0.5]
    check(off_national.empty, f"unit sum = KOSIS national row: {len(checks) - len(off_national)}/{len(checks)}")
    moved = checks[(checks.panel_sum - checks.units_sum).abs() > 0.01]
    check(moved.empty, f"panel sum = unit sum after moving to 2025 units: {len(checks) - len(moved)}/{len(checks)}")
    check((checks.missing_units == "").all(), "no year leaves a unit of that year without a value")
    check((checks.city_vs_gu_max_gap.fillna(0) < 0.5).all(), "city rows = sum of their general-gu rows")
    covered = [(variable, year) for variable, year in zip(checks.variable, checks.year)]
    full = [panel[panel.year == year][variable].notna().sum() == 229 for variable, year in covered]
    check(all(full), f"every variable and year covers 229 base units ({sum(full)}/{len(full)})")
    check(panel.groupby("year").lgu_code.nunique().eq(229).all() and panel.year.between(2008, 2025).all(),
          f"one row per base unit and year 2008-2025 ({len(panel):,} rows)")

    # 2. 2025 = the single-year table
    table = pd.read_csv(TABLE_2025, dtype={"lgu_code": str}).set_index("lgu_code")
    latest = panel[panel.year == 2025].set_index("lgu_code")
    for variable in sorted(checks.variable.unique()):
        joined = latest[variable].rename("panel").to_frame().join(table[variable].rename("table"))
        diff = (joined.panel - joined.table).abs().max()
        check(diff < 0.5, f"2025 {variable} = 2025 table (max |diff| {diff:g})")

    # 3. boundary changes
    sejong = panel[panel.lgu_code == "36110"].set_index("year")
    check(sejong.loc[2011, "alloc_share"] > 0 and sejong.loc[2011, "births"] > 0,
          f"Sejong 2011 births come from 연기·공주·청원 pieces (value {sejong.loc[2011, 'births']:.1f}, alloc_share {sejong.loc[2011, 'alloc_share']})")
    check(sejong.loc[2013, "alloc_share"] == 0, "Sejong 2013 values are its own (alloc_share 0)")
    cheongju_2013 = value(panel, "43110", 2013, "pop_total")
    check(abs(cheongju_2013 - raw_value("pop", 2013, "T20", "43110") - raw_value("pop", 2013, "T20", "43710")) < 0.5,
          f"Cheongju 2013 population = 청주시 + 청원군 ({cheongju_2013:,.0f})")
    michuhol = value(panel, "28177", 2018, "migr_in")
    check(abs(michuhol - raw_value("migration", 2018, "T10", "28170") - raw_value("migration", 2018, "T10", "28177")) < 0.5,
          f"Michuhol 2018 in-migration = 남구 (to June) + 미추홀구 (from July) ({michuhol:,.0f})")
    gunwi = value(panel, "27720", 2022, "births")
    check(gunwi > 0, f"Gunwi 2022 births reach the 2025 Daegu unit 27720 ({gunwi:,.0f})")

    failed = 0
    for ok, message in results:
        failed += not ok
        print(f"{'ok  ' if ok else 'FAIL'}  {message}")
    print(f"{len(results) - failed}/{len(results)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
