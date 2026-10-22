#!/usr/bin/env python3
"""Assemble the 2025 single-year sigungu table (229 local governments, 2025-12-31 boundary).

    python scripts/sgg2025/build_table.py

Reads the raw KOSIS rows (collect_kosis.py) and the explicit code map
(build_code_map.py). Writes to data/derived/sgg2025/:
  lgu229_2025.csv / .parquet     one row per local government, wide
  codebook.csv                   variable definitions, source, reference date, unit, license
  national_check.csv             sum of 229 units vs the national row of the same table
"""

from __future__ import annotations

import json
from collections import defaultdict

import numpy as np
import pandas as pd

from atlas_keys import REPO_ROOT

RAW = REPO_ROOT / "data" / "raw" / "kosis" / "sgg2025"
CODES = REPO_ROOT / "data" / "derived" / "region-codes"
OUT = REPO_ROOT / "data" / "derived" / "sgg2025"
RECEIPT = REPO_ROOT / "data" / "manifests" / "kosis-sgg2025-fetch.json"

LICENSE = "KOSIS 제공 통계, 공공누리 제1유형(출처표시) 조건으로 이용 — 표별 표시는 KOSIS 화면에서 재확인 필요"

SRC = {
    "mois_rr": ("행정안전부 「주민등록인구현황」(KOSIS)", "2025-12-31"),
    "migr": ("통계청 「국내인구이동통계」(KOSIS)", "2025-01-01~2025-12-31"),
    "births": ("통계청 「인구동향조사」 출생(KOSIS)", "2025-01-01~2025-12-31"),
    "deaths": ("통계청 「인구동향조사」 사망(KOSIS)", "2025-01-01~2025-12-31"),
    "biz": ("통계청 「전국사업체조사」 등록기반 지표(KOSIS e-지방지표)", "2024-12-31"),
    "lfs": ("통계청 「지역별고용조사」 2025년 하반기(KOSIS)", "2025-10 조사(하반기)"),
    "census": ("통계청 「인구주택총조사」 등록센서스(KOSIS)", "2025-11-01"),
}

# (var, dataset, ITM_ID, C2 filter or None, unit, kind, source key, label)
#   kind: count = additive, rate = not additive
VARS: list[tuple] = [
    ("pop_total", "pop_sex", "T20", None, "명", "count", "mois_rr", "주민등록인구 총계"),
    ("pop_male", "pop_sex", "T21", None, "명", "count", "mois_rr", "주민등록인구 남자"),
    ("pop_female", "pop_sex", "T22", None, "명", "count", "mois_rr", "주민등록인구 여자"),
    ("households_rr", "households", "T1", None, "세대", "count", "mois_rr", "주민등록 세대수"),
    ("migr_in", "migration", "T10", None, "명", "count", "migr", "총전입"),
    ("migr_out", "migration", "T20", None, "명", "count", "migr", "총전출"),
    ("migr_net", "migration", "T25", None, "명", "count", "migr", "순이동(전입-전출)"),
    ("births", "births", "T1", None, "명", "count", "births", "출생아수"),
    ("tfr", "births", "T2", None, "가임여자 1명당 명", "rate", "births", "합계출산율"),
    ("deaths", "deaths", "T1", "0", "명", "count", "deaths", "사망자수(성별 계)"),
    ("establishments", "establishments", "T10", None, "개", "count", "biz", "사업체수(등록기반)"),
    ("employees", "employees", "T001", None, "명", "count", "biz", "종사자수(등록기반) 계"),
    ("employees_male", "employees", "T002", None, "명", "count", "biz", "종사자수(등록기반) 남자"),
    ("employees_female", "employees", "T003", None, "명", "count", "biz", "종사자수(등록기반) 여자"),
    ("employees_mfg", "employees_mfg", "T10", None, "명", "count", "biz", "제조업 종사자수(등록기반)"),
    ("employees_retail", "employees_retail", "T10", None, "명", "count", "biz", "도소매업 종사자수(등록기반)"),
    ("lfs_pop15p_k", "lfs_summary", "T1", None, "천명", "survey", "lfs", "15세이상인구"),
    ("lfs_labor_force_k", "lfs_summary", "T2", None, "천명", "survey", "lfs", "경제활동인구"),
    ("lfs_employed_k", "lfs_summary", "T3", None, "천명", "survey", "lfs", "취업자"),
    ("lfs_unemployed_k", "lfs_summary", "T4", None, "천명", "survey", "lfs", "실업자"),
    ("lfs_lfpr", "lfs_summary", "T6", None, "%", "rate", "lfs", "경제활동참가율"),
    ("lfs_emp_rate", "lfs_summary", "T7", None, "%", "rate", "lfs", "고용률(15세 이상)"),
    ("lfs_emp_rate_15_64", "lfs_summary", "T11", None, "%", "rate", "lfs", "고용률(15~64세)"),
    ("lfs_unemp_rate", "lfs_summary", "T8", None, "%", "rate", "lfs", "실업률"),
    ("lfs_emp_rate_65p", "lfs_emp_age", "T12", "040", "%", "rate", "lfs", "고용률(65세 이상)"),
    ("census_pop", "census_T100", "T100", None, "명", "count", "census", "총인구(내·외국인)"),
    ("census_pop_male", "census_T110", "T110", None, "명", "count", "census", "총인구 남자"),
    ("census_pop_female", "census_T120", "T120", None, "명", "count", "census", "총인구 여자"),
    ("census_foreigners", "census_T140", "T140", None, "명", "count", "census", "외국인"),
    ("census_households", "census_T200", "T200", None, "가구", "count", "census", "가구 계"),
    ("census_households_general", "census_T210", "T210", None, "가구", "count", "census", "일반가구"),
    ("housing_total", "census_T310", "T310", None, "호", "count", "census", "주택 계"),
    ("housing_detached", "census_T311", "T311", None, "호", "count", "census", "단독주택"),
    ("housing_apartment", "census_T312", "T312", None, "호", "count", "census", "아파트"),
    ("housing_rowhouse", "census_T313", "T313", None, "호", "count", "census", "연립주택"),
    ("housing_multiplex", "census_T314", "T314", None, "호", "count", "census", "다세대주택"),
    ("housing_in_nonres", "census_T315", "T315", None, "호", "count", "census", "비주거용 건물 내 주택"),
    ("dwellings_non_housing", "census_T320", "T320", None, "호", "count", "census", "주택 이외의 거처"),
]

AGE5 = [(f"{a:02d}_{a + 4:02d}", a, a + 4) for a in range(0, 100, 5)] + [("100p", 100, 200)]
BROAD = [("0_14", 0, 14), ("15_64", 15, 64), ("65p", 65, 200), ("75p", 75, 200), ("85p", 85, 200)]

# KOSIS publishes no numeric RSE for 지역별고용조사 시군구 tables; the RSE item carries '*' only
# where RSE >= 25% (table comment: "상대표준오차(RSE)가 높아 신뢰하기 어려운 경우 '*' 표시").
RSE_FLAGS = [
    ("lfs_employed_rse25", "lfs_emp_age", "T11", "000", "취업자(15세 이상)"),
    ("lfs_emp_rate_rse25", "lfs_emp_age", "T21", "000", "고용률(15세 이상)"),
    ("lfs_unemployed_rse25", "lfs_summary", "T9", None, "실업자"),
    ("lfs_unemp_rate_rse25", "lfs_summary", "T10", None, "실업률"),
]

DERIVED = [
    ("aged_share_65p", "%", "고령인구 비율 = pop_age_65p / pop_total × 100", "mois_rr"),
    ("youth_share_0_14", "%", "유소년인구 비율 = pop_age_0_14 / pop_total × 100", "mois_rr"),
    ("old_age_dependency", "%", "노년부양비 = pop_age_65p / pop_age_15_64 × 100", "mois_rr"),
    ("sex_ratio", "여자 100명당 남자", "성비 = pop_male / pop_female × 100", "mois_rr"),
    ("persons_per_household_rr", "명/세대", "세대당 인구 = pop_total / households_rr", "mois_rr"),
    ("apartment_share", "%", "아파트 비율 = housing_apartment / housing_total × 100", "census"),
]


def num(v) -> float:
    s = str(v).strip().replace(",", "")
    try:
        return float(s)
    except ValueError:
        return np.nan  # '*' = 비공개(표본 부족), '-' = 해당 없음


def age_of(c2_nm: str) -> int | None:
    s = c2_nm.replace("세", "").replace("이상", "").strip()
    return int(s) if s.isdigit() else None


def main() -> None:
    receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))["requests"]
    base = pd.read_csv(CODES / "lgu_base_20251231.csv", dtype=str)
    cmap = pd.read_csv(CODES / "sgg_code_map_20251231.csv", dtype=str).fillna("")
    lgu_rows = cmap[cmap.level == "lgu"]
    # code system as stored in the receipt: KOSTAT7_2026 rows come from KOSTAT5-labelled tables
    lgu_rows = lgu_rows.assign(sys=lgu_rows.code_system.replace({"KOSTAT7_2026": "KOSTAT5"}))
    to_lgu = {(s, c): l for s, c, l in zip(lgu_rows.sys, lgu_rows.code, lgu_rows.lgu_code)}
    single_tier = cmap[cmap.method == "single_tier_sido_row"]
    sido_fallback = {(s, c): l for s, c, l in zip(single_tier.code_system, single_tier.code, single_tier.lgu_code)}

    def load(ds):
        return json.loads((RAW / f"{ds}.json").read_text(encoding="utf-8"))

    table = base[["lgu_code", "lgu_name", "sido_code", "sido_name"]].copy().set_index("lgu_code")
    for sys_, col in (("KOSTAT5", "kostat_code"), ("LFS4", "lfs_code")):
        sub = lgu_rows[(lgu_rows.code_system == sys_)]
        table[col] = sub.groupby("lgu_code").code.agg(lambda x: "|".join(sorted(x)))
    table["kostat7_2026_code"] = lgu_rows[lgu_rows.code_system == "KOSTAT7_2026"].set_index("lgu_code").code

    national = []
    for var, ds, itm, c2, unit, kind, src, label in VARS:
        system = receipt[ds]["code_system"]
        vals, nat, fallback = {}, None, {}
        for r in load(ds):
            if r["ITM_ID"] != itm or (c2 is not None and r.get("C2") != c2):
                continue
            if r["C1"] == "00":
                nat = num(r["DT"])
            if (system, r["C1"]) in sido_fallback:
                fallback[sido_fallback[(system, r["C1"])]] = num(r["DT"])
            lgu = to_lgu.get((system, r["C1"]))
            if lgu is None:
                continue
            if lgu in vals:
                raise SystemExit(f"{var}: two lgu-level rows for {lgu}")
            vals[lgu] = num(r["DT"])
        for lgu, v in fallback.items():
            vals.setdefault(lgu, v)
        table[var] = pd.Series(vals)
        if kind == "count":
            national.append({"var": var, "table": receipt[ds]["tbl_id"], "sum_229": table[var].sum(),
                             "national_row": nat, "n_units": int(table[var].notna().sum())})

    for var, ds, itm, c2, label in RSE_FLAGS:
        star = {to_lgu.get(("LFS4", r["C1"])) for r in load(ds)
                if r["ITM_ID"] == itm and (c2 is None or r.get("C2") == c2) and str(r["DT"]).strip() == "*"}
        table[var] = [(1 if c in star else 0) if pd.notna(lc) else np.nan for c, lc in zip(table.index, table.lfs_code)]

    # age structure from 1-year ages (MOIS 2025-12)
    ages = defaultdict(lambda: defaultdict(float))
    for sex, ds in (("", "pop_age1_T2"), ("_male", "pop_age1_T3"), ("_female", "pop_age1_T4")):
        for r in load(ds):
            lgu = to_lgu.get(("MOIS5", r["C1"]))
            a = age_of(r["C2_NM"])
            if lgu is None or a is None:
                continue
            ages[(lgu, sex)][a] += num(r["DT"])
    for sex in ("", "_male", "_female"):
        groups = AGE5 + BROAD if sex == "" else BROAD
        for tag, lo, hi in groups:
            table[f"pop{sex}_age_{tag}"] = pd.Series(
                {lgu: sum(v for a, v in d.items() if lo <= a <= hi) for (lgu, s), d in ages.items() if s == sex})
    table["pop_age_sum_check"] = pd.Series({lgu: sum(d.values()) for (lgu, s), d in ages.items() if s == ""})

    t = table
    t["aged_share_65p"] = t.pop_age_65p / t.pop_total * 100
    t["youth_share_0_14"] = t.pop_age_0_14 / t.pop_total * 100
    t["old_age_dependency"] = t.pop_age_65p / t.pop_age_15_64 * 100
    t["sex_ratio"] = t.pop_male / t.pop_female * 100
    t["persons_per_household_rr"] = t.pop_total / t.households_rr
    t["apartment_share"] = t.housing_apartment / t.housing_total * 100
    t = t.drop(columns="pop_age_sum_check").reset_index()

    # ---- codebook ---------------------------------------------------------------------------
    cb = [
        ("lgu_code", "", "행정안전부 시군구 코드(5자리), 2025-12-31 기준 기초자치단체·제주 행정시·세종", "", "", "id"),
        ("lgu_name", "", "기초자치단체 이름", "", "", "id"),
        ("sido_code", "", "행정안전부 시도 코드(2자리, 2025-12-31)", "", "", "id"),
        ("sido_name", "", "시도 이름", "", "", "id"),
        ("kostat_code", "", "같은 단위의 통계청 시군구 코드(KOSIS 인구동향·센서스 표)", "", "", "id"),
        ("kostat7_2026_code", "", "2026-07 이후 갱신된 KOSIS 표(사업체)의 7자리 코드, 광주·전남만 해당", "", "", "id"),
        ("lfs_code", "", "지역별고용조사 4자리 행정구역 코드. 세종은 지역별고용조사 시군구 표에 없음", "", "", "id"),
    ]
    for var, ds, itm, c2, unit, kind, src, label in VARS:
        cb.append((var, unit, f"{label} [{receipt[ds]['tbl_id']} {itm}{' / ' + c2 if c2 else ''}]", *SRC[src], kind))
    for tag, lo, hi in AGE5 + BROAD:
        cb.append((f"pop_age_{tag}", "명", f"주민등록인구 {lo}세~{'' if hi >= 200 else str(hi) + '세'} (1세별 합산) [DT_1B04006]",
                   *SRC["mois_rr"], "count"))
    for sex, nm in (("_male", "남자"), ("_female", "여자")):
        for tag, lo, hi in BROAD:
            cb.append((f"pop{sex}_age_{tag}", "명", f"주민등록인구 {nm} {lo}세~{'' if hi >= 200 else str(hi) + '세'} [DT_1B04006]",
                       *SRC["mois_rr"], "count"))
    for var, unit, label, src in DERIVED:
        cb.append((var, unit, label, *SRC[src], "derived"))
    for var, ds, itm, c2, label in RSE_FLAGS:
        cb.append((var, "0/1", f"{label} 상대표준오차 25% 이상이면 1 (KOSIS '*' 표시) [{receipt[ds]['tbl_id']} {itm}]",
                   *SRC["lfs"], "flag"))
    codebook = pd.DataFrame(cb, columns=["variable", "unit", "definition", "source", "reference_date", "kind"])
    codebook["license"] = np.where(codebook.kind == "id", "", LICENSE)
    missing = set(t.columns) ^ set(codebook.variable)
    if missing:
        raise SystemExit(f"codebook/table mismatch: {missing}")
    t = t[list(codebook.variable)]

    OUT.mkdir(parents=True, exist_ok=True)
    t.to_csv(OUT / "lgu229_2025.csv", index=False, encoding="utf-8")
    t.to_parquet(OUT / "lgu229_2025.parquet", index=False)
    codebook.to_csv(OUT / "codebook.csv", index=False, encoding="utf-8")
    nat = pd.DataFrame(national)
    nat["diff"] = nat.sum_229 - nat.national_row
    nat.to_csv(OUT / "national_check.csv", index=False, encoding="utf-8")
    print(f"{len(t)} rows x {t.shape[1]} cols -> {OUT.relative_to(REPO_ROOT)}")
    print(nat.to_string(index=False))


if __name__ == "__main__":
    main()
