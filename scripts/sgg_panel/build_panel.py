#!/usr/bin/env python3
"""Build the 2008-2025 sigungu panel on the 2025-12-31 base units (layer stage 3a).

    python scripts/sgg_panel/build_panel.py

Input: data/raw/kosis/sgg-panel (collect_kosis_panel.py) and the crosswalk package
packages/kr-sgg-crosswalk (unit lists by year and the lgu crosswalk to 2025-12-31).

1. Codes are resolved per year through the package's unit lists, never by cutting digits:
   MOIS5 tables by the MOIS code, KOSTAT5 tables by the KOSTAT code of that year's units.
   A city's own row is used when the table has one; otherwise its general-gu rows are summed
   into it (sgg_units lgu_code). Where both exist the two are compared.
2. Each year's lgu values are moved to the 2025-12-31 base units with harmonize() (extensive
   variables, population weights).
3. Output data/derived/sgg-panel/lgu229_panel.csv (one row per base unit and year 2008-2025,
   one column per variable, empty before a series starts, alloc_share = the largest share that
   came through split pieces) and panel_check.csv (national row vs unit sum vs panel sum,
   unresolved codes, city vs general-gu rows per series and year).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "packages" / "kr-sgg-crosswalk" / "code"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect_kosis_panel import RAW_DIR, SERIES  # noqa: E402
from harmonize import harmonize, load_crosswalk, load_units  # noqa: E402

PACKAGE = ROOT / "packages" / "kr-sgg-crosswalk"
OUT = ROOT / "data" / "derived" / "sgg-panel"
NATIONAL_NAMES = {"전국", "계"}


def number(value) -> float | None:
    text = str(value).strip().replace(",", "")
    try:
        return float(text)
    except ValueError:
        return None  # '-', '*', '' and other non-numbers stay missing


def whole_links(crosswalk: pd.DataFrame) -> pd.DataFrame:
    """Crosswalk rows where a unit of that year is the whole of one 2025 base unit and nothing
    else (code kept, recoded or renamed, never split or merged)."""
    cw = crosswalk.copy()
    cw["year"] = cw.year.astype(int)
    one = cw.groupby(["year", "tgt_code"]).src_code.transform("nunique") == 1
    whole = (cw.w_src.astype(float) > 0.999) & (cw.w_tgt.astype(float) > 0.999)
    return cw[one & whole][["year", "src_code", "tgt_code"]]


def other_year_code_map(year: int, key: str, lgu_units: pd.DataFrame, links: pd.DataFrame) -> dict[str, tuple[str, str]]:
    """KOSIS sometimes labels a year's values with a unit's code from another year: today's code
    for past years (강원 42→51, 전북 45→52, the 2022 KOSTAT codes of counties), or the code before
    a mid-year change (인천 남구 → 미추홀구 2018-07, 군위군's 2021 KOSTAT code in 2022). For a code
    unknown in `year`, take the nearest year that lists it; when that unit and one unit of `year`
    are each the whole of the same 2025 base unit, the code means that unit of `year`.
    Returns code -> (unit of `year`, how)."""
    other = lgu_units[(lgu_units.year != year) & (lgu_units[key] != "")].copy()
    other["distance"] = (other.year - year).abs()
    nearest = other.sort_values(["distance", "year"]).drop_duplicates(key)[["year", "code"] + ([key] if key != "code" else [])]
    to_base = links.rename(columns={"src_code": "code"})
    hits = nearest.merge(to_base, on=["year", "code"])
    back = links[links.year == year].rename(columns={"src_code": "unit"})[["tgt_code", "unit"]]
    hits = hits.merge(back, on="tgt_code")
    return {code: (unit, f"code_of_{seen}") for code, unit, seen in zip(hits[key], hits.unit, hits.year)}


def resolve(rows: list[dict], year: int, system: str, items: dict[str, str],
            lgu_units: pd.DataFrame, sgg_units: pd.DataFrame, links: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    key = "code" if system == "MOIS5" else "kostat"
    lgu_y = lgu_units[(lgu_units.year == year) & (lgu_units[key] != "")]
    sgg_y = sgg_units[(sgg_units.year == year) & (sgg_units[key] != "")]
    direct = dict(zip(lgu_y[key], lgu_y.code))
    via_gu = {c: l for c, l in zip(sgg_y[key], sgg_y.lgu_code) if c not in direct}
    if lgu_y[key].duplicated().any() or sgg_y[key].duplicated().any():
        raise SystemExit(f"{year} {system}: a code names two units in the unit lists")
    other = {code: unit for code, (unit, _) in other_year_code_map(year, key, lgu_units, links).items()
             if code not in direct and code not in via_gu}
    direct = {**direct, **other}

    national, city, gu, unresolved = {}, {}, {}, set()
    for row in rows:
        variable = items.get(row.get("ITM_ID"))
        if variable is None:
            continue
        code, value = str(row["C1"]).strip(), number(row.get("DT"))
        if row.get("C1_NM", "").strip() in NATIONAL_NAMES:
            national[variable] = value
        elif code in direct:
            # Two codes for one unit (before and after a mid-year rename) add up.
            target = (direct[code], variable)
            city[target] = value if city.get(target) is None else city[target] + (value or 0)
        elif code in via_gu:
            target = (via_gu[code], variable)
            gu[target] = (gu.get(target) or 0) + (value or 0)
        elif len(code) == 5 and not code.endswith("000"):
            unresolved.add(f"{code} {row.get('C1_NM', '').strip()}")

    values = dict(city)
    gaps = []
    for target, total in gu.items():
        if target in values and values[target] is not None:
            gaps.append(abs(values[target] - total))
        else:
            values[target] = total
    frame = pd.DataFrame([(code, variable, value) for (code, variable), value in values.items()],
                         columns=["code", "variable", "value"])
    expected = set(lgu_y.code)
    missing = sorted(expected - set(frame.code))
    return frame, {"national": national, "unresolved": sorted(unresolved), "missing_units": missing, "other_year_codes": len(other),
                   "city_vs_gu_max_gap": max(gaps) if gaps else 0.0}


def main() -> None:
    lgu_units = load_units(PACKAGE / "units" / "lgu_units_by_year.csv")
    sgg_units = load_units(PACKAGE / "units" / "sgg_units_by_year.csv")
    crosswalk = load_crosswalk(PACKAGE / "crosswalk" / "crosswalk_lgu_to_base20251231.csv")
    names = lgu_units[lgu_units.year == 2025].set_index("code")["name"]
    links = whole_links(crosswalk)

    panel, checks = [], []
    for series in SERIES:
        first, last = series["years"]
        variables = list(series["items"].values())
        for year in range(first, last + 1):
            path = RAW_DIR / f"{series['id']}_{year}.json"
            if not path.exists():
                raise SystemExit(f"missing {path.relative_to(ROOT)}; run collect_kosis_panel.py")
            rows = json.loads(path.read_text(encoding="utf-8"))
            frame, info = resolve(rows, year, series["code_system"], series["items"], lgu_units, sgg_units, links)
            wide = frame.pivot(index="code", columns="variable", values="value").reset_index().assign(year=year)
            moved = harmonize(wide, crosswalk, code_system="mois", extensive=variables, weights="pop")
            for variable in variables:
                before = wide[variable].sum(min_count=1)
                after = moved[variable].sum(min_count=1)
                checks.append({
                    "series": series["id"], "table": series["tbl"], "year": year, "variable": variable,
                    "kosis_national": info["national"].get(variable), "units_sum": before, "panel_sum": after,
                    "units": int(wide[variable].notna().sum()), "panel_units": int(moved[variable].notna().sum()),
                    "unresolved_codes": "; ".join(info["unresolved"]), "missing_units": "; ".join(info["missing_units"]),
                    "city_vs_gu_max_gap": info["city_vs_gu_max_gap"], "other_year_codes": info["other_year_codes"],
                })
                part = moved[["tgt_code", variable, "alloc_share"]].rename(columns={"tgt_code": "lgu_code", variable: "value"})
                panel.append(part.assign(year=year, variable=variable))
            print(f"{series['id']:<11} {year}: {len(wide)} units -> {len(moved)} base units"
                  f"{', unresolved ' + str(len(info['unresolved'])) if info['unresolved'] else ''}"
                  f"{', missing ' + str(len(info['missing_units'])) if info['missing_units'] else ''}", flush=True)

    OUT.mkdir(parents=True, exist_ok=True)
    long = pd.concat(panel, ignore_index=True)
    variables = [v for s in SERIES for v in s["items"].values()]
    out = long.pivot_table(index=["lgu_code", "year"], columns="variable", values="value", dropna=False).round(3)
    out = out.reindex(columns=variables)
    # Share of the unit-year's values that came through split pieces (max over series).
    out["alloc_share"] = long.groupby(["lgu_code", "year"]).alloc_share.max()
    out = out.reset_index()
    out.insert(1, "lgu_name", out.lgu_code.map(names))
    out = out.sort_values(["lgu_code", "year"])
    out.to_csv(OUT / "lgu229_panel.csv", index=False, encoding="utf-8", lineterminator="\n")
    check = pd.DataFrame(checks)
    check["units_vs_national"] = (check.units_sum - check.kosis_national).round(3)
    check["panel_vs_units"] = (check.panel_sum - check.units_sum).round(3)
    check.to_csv(OUT / "panel_check.csv", index=False, encoding="utf-8", lineterminator="\n")
    print(f"lgu229_panel.csv: {len(out):,} rows, {(OUT / 'lgu229_panel.csv').stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
