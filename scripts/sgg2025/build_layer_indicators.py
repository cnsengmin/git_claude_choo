#!/usr/bin/env python3
"""Indicator list of the map layer people/sgg-stats-2025, from the 2025 sigungu codebook.

    python scripts/sgg2025/build_layer_indicators.py          # write
    python scripts/sgg2025/build_layer_indicators.py --check  # fail if out of date (CI)

Every codebook variable except ids and reliability flags becomes one indicator with a short
label (the definition before its KOSIS table note or formula), unit, kind, source, reference
date, the sidebar group of its source, and, for survey values, the flag column that marks a
relative standard error of 25% or more. Standard library only.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CODEBOOK = REPO_ROOT / "data" / "derived" / "sgg2025" / "codebook.csv"
OUT = REPO_ROOT / "layers" / "people" / "sgg-stats-2025" / "indicators.json"

# Sidebar groups by codebook source, in display order.
GROUPS = [
    ("주민등록인구현황", "주민등록 인구·연령"),
    ("국내인구이동통계", "인구이동"),
    ("인구동향조사", "출생·사망"),
    ("전국사업체조사", "사업체·종사자 (2024)"),
    ("지역별고용조사", "지역별고용조사"),
    ("인구주택총조사", "인구주택총조사 (등록센서스)"),
]
RSE_FLAGS = {
    "lfs_employed_k": "lfs_employed_rse25",
    "lfs_emp_rate": "lfs_emp_rate_rse25",
    "lfs_unemployed_k": "lfs_unemployed_rse25",
    "lfs_unemp_rate": "lfs_unemp_rate_rse25",
}


def short_label(definition: str) -> str:
    return re.split(r" \[| = ", definition, maxsplit=1)[0].strip()


def build() -> list[dict]:
    rows = list(csv.DictReader(CODEBOOK.open(encoding="utf-8-sig")))
    indicators = []
    for row in rows:
        if row["kind"] in ("id", "flag"):
            continue
        group = next((name for key, name in GROUPS if key in row["source"]), None)
        if group is None:
            raise SystemExit(f"{row['variable']}: no sidebar group for source {row['source']!r}")
        indicators.append({
            "variable": row["variable"],
            "label": short_label(row["definition"]),
            "unit": row["unit"],
            "kind": row["kind"],
            "group": group,
            "source": row["source"],
            "reference": row["reference_date"],
            **({"rseFlag": RSE_FLAGS[row["variable"]]} if row["variable"] in RSE_FLAGS else {}),
        })
    order = [name for _, name in GROUPS]
    return sorted(indicators, key=lambda item: order.index(item["group"]))


def main() -> None:
    indicators = build()
    text = json.dumps(indicators, ensure_ascii=False, indent=2) + "\n"
    where = OUT.relative_to(REPO_ROOT).as_posix()
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            raise SystemExit(f"{where} is out of date; run scripts/sgg2025/build_layer_indicators.py")
        print(f"{where}: up to date ({len(indicators)} indicators)")
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"{where}: {len(indicators)} indicators")


if __name__ == "__main__":
    main()
