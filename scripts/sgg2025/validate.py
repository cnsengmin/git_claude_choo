#!/usr/bin/env python3
"""Validate the 2025 sigungu table, its code map and its national/sido totals.

    python scripts/sgg2025/validate.py [--keyfile PATH]

Exit code 0 only if every check passes. With --keyfile (or keys in env /
.env.local) it also scans every output and manifest for leaked key values.
"""

from __future__ import annotations

import argparse
import json
import re
import sys

import pandas as pd

from atlas_keys import LEGACY_NAMES, REPO_ROOT, _parse, default_keyfile
from build_table import AGE5, VARS

DER = REPO_ROOT / "data" / "derived"
RAW = REPO_ROOT / "data" / "raw" / "kosis" / "sgg2025"
RECEIPT = json.loads((REPO_ROOT / "data" / "manifests" / "kosis-sgg2025-fetch.json").read_text(encoding="utf-8"))["requests"]

res: list[tuple[str, bool, str]] = []


def check(name, ok, detail=""):
    res.append((name, bool(ok), str(detail)))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keyfile")
    args = ap.parse_args()

    t = pd.read_parquet(DER / "sgg2025" / "lgu229_2025.parquet")
    tc = pd.read_csv(DER / "sgg2025" / "lgu229_2025.csv", dtype={"lgu_code": str, "sido_code": str, "kostat_code": str, "lfs_code": str})
    base = pd.read_csv(DER / "region-codes" / "lgu_base_20251231.csv", dtype=str)
    cmap = pd.read_csv(DER / "region-codes" / "sgg_code_map_20251231.csv", dtype=str).fillna("")
    cb = pd.read_csv(DER / "sgg2025" / "codebook.csv", dtype=str)
    nat = pd.read_csv(DER / "sgg2025" / "national_check.csv")

    # ---- structure ---------------------------------------------------------------------
    check("단위 229개, lgu_code 중복 없음", len(t) == 229 and t.lgu_code.is_unique, len(t))
    check("lgu_code = 기준 단위 목록과 동일", set(t.lgu_code) == set(base.lgu_code))
    check("코드 열은 문자열 5자리(CSV·Parquet 모두)",
          t.lgu_code.str.fullmatch(r"\d{5}").all() and tc.lgu_code.str.fullmatch(r"\d{5}").all()
          and str(t.lgu_code.dtype).lower().startswith(("string", "str", "object")))
    numeric = list(t.select_dtypes("number").columns)
    check("CSV와 Parquet 값 일치", (tc[numeric] - t[numeric]).abs().max().max() < 1e-9
          and (tc.lgu_code == t.lgu_code).all(), f"숫자 열 {len(numeric)}개")
    check("코드북이 모든 열을 정의(출처·기준일·라이선스 포함)",
          list(cb.variable) == list(t.columns) and cb.loc[cb.kind != "id", ["source", "reference_date", "license"]].notna().all().all())
    check("증평군(43745)·영동군(43740)이 따로 존재", {"43745", "43740"} <= set(t.lgu_code))
    check("일반구가 있는 시 12개, 일반구 35개", (base.n_general_gu.astype(int) > 0).sum() == 12
          and base.n_general_gu.astype(int).sum() == 35)

    # ---- code map ------------------------------------------------------------------------
    check("대응표에 미매칭 코드 없음", (cmap.method != "UNMATCHED").all(), (cmap.method == "UNMATCHED").sum())
    for sys_, n in (("MOIS5", 229), ("KOSTAT5", 229), ("LFS4", 228)):
        sub = cmap[(cmap.code_system == sys_) & (cmap.level == "lgu")]
        check(f"{sys_}: 단위당 코드 1개, {n}개 단위", sub.lgu_code.is_unique and sub.lgu_code.nunique() == n, sub.lgu_code.nunique())
    k = cmap[(cmap.code_system == "KOSTAT5") & (cmap.mois_sgg_code != "")]
    check("통계청↔행안부 시군구 252쌍이 1:1(경계 겹침+이름)", len(k) == 252 and k.code.is_unique and k.mois_sgg_code.is_unique, len(k))
    known = {("KOSTAT5", "22520"): "27720", ("LFS4", "3731"): "27720", ("KOSTAT5", "33040"): "43110",
             ("KOSTAT5", "29010"): "36110", ("KOSTAT5", "33590"): "43745", ("LFS4", "3240"): "51820",
             ("LFS4", "3834"): "48820", ("KOSTAT7_2026", "1236010"): "46110", ("MOIS5", "28177"): "28177"}
    got = {key: cmap[(cmap.code_system == key[0]) & (cmap.code == key[1])].lgu_code.tolist() for key in known}
    check("알려진 대응(군위·청주·세종·증평·고성 2곳·목포 7자리·미추홀)", all(got[k] == [v] for k, v in known.items()),
          {f"{a}:{b}": g for (a, b), g in got.items() if g != [known[(a, b)]]})
    check("앞자리 자르기 방식과 다른 코드가 실제로 존재(통계청≠행안부)",
          (t.kostat_code != t.lgu_code).sum() > 200, (t.kostat_code != t.lgu_code).sum())

    # ---- national totals vs published national row ---------------------------------------
    nat_ok = (nat["diff"].abs() < 0.5) & (nat.n_units == 229)
    check(f"합산형 {len(nat)}개 변수: 229개 합 = KOSIS 전국 공표치", nat_ok.all(),
          ", ".join(nat.loc[~nat_ok, "var"]) or "차이 0")

    # ---- sido totals -------------------------------------------------------------------
    sido_rows = cmap[cmap.level == "sido"]
    worst, n_cmp = 0.0, 0
    for var, ds, itm, c2, unit, kind, src, label in VARS:
        if kind != "count":
            continue
        system = RECEIPT[ds]["code_system"]
        mine = t.groupby("sido_name")[var].sum()
        for r in json.loads((RAW / f"{ds}.json").read_text(encoding="utf-8")):
            if r["ITM_ID"] != itm or (c2 is not None and r.get("C2") != c2):
                continue
            hit = sido_rows[(sido_rows.code == r["C1"]) & (sido_rows.code_system.isin([system, "KOSTAT7_2026"]))]
            if hit.empty:
                continue
            nm = re.sub(r"\s+", "", hit.name.iloc[0])
            if nm in mine.index:
                worst = max(worst, abs(mine[nm] - float(r["DT"])))
                n_cmp += 1
    check("시도별 합계 = KOSIS 시도 공표치(모든 합산형 변수)", worst < 0.5, f"{n_cmp}건 비교, 최대 차이 {worst:g}")

    # ---- internal consistency ------------------------------------------------------------
    age5 = [f"pop_age_{tag}" for tag, _, _ in AGE5]
    check("남+여 = 총인구(주민등록)", (t.pop_male + t.pop_female - t.pop_total).abs().max() == 0)
    check("5세 연령군 합 = 총인구(주민등록)", (t[age5].sum(axis=1) - t.pop_total).abs().max() == 0)
    check("남녀별 0–14·15–64·65+ 합 = 남·여 인구",
          all((t[[f"pop_{s}_age_0_14", f"pop_{s}_age_15_64", f"pop_{s}_age_65p"]].sum(axis=1) - t[f"pop_{s}"]).abs().max() == 0
              for s in ("male", "female")))
    check("전입-전출 = 순이동", (t.migr_in - t.migr_out - t.migr_net).abs().max() == 0)
    check("종사자 남+여 = 계", (t.employees_male + t.employees_female - t.employees).abs().max() == 0)
    check("센서스 남+여 = 총인구", (t.census_pop_male + t.census_pop_female - t.census_pop).abs().max() == 0)
    hs = ["housing_detached", "housing_apartment", "housing_rowhouse", "housing_multiplex", "housing_in_nonres"]
    check("주택 유형 합 = 주택 계", (t[hs].sum(axis=1) - t.housing_total).abs().max() == 0)
    rates = ["lfs_lfpr", "lfs_emp_rate", "lfs_emp_rate_15_64", "lfs_unemp_rate", "lfs_emp_rate_65p", "aged_share_65p"]
    check("비율 변수 0–100 범위", ((t[rates] >= 0) & (t[rates] <= 100) | t[rates].isna()).all().all())
    check("지역별고용조사 결측은 세종 1곳뿐(시군구 표 미제공)", t[t.lfs_emp_rate.isna()].lgu_code.tolist() == ["36110"])

    # ---- cross-source plausibility (catches a wrong code pairing) --------------------------
    r1 = t.census_pop / t.pop_total
    check("등록센서스/주민등록 인구비 0.85–1.25(대응 오류 탐지)", r1.between(0.85, 1.25).all(),
          f"범위 {r1.min():.3f}–{r1.max():.3f}; 최대 {t.lgu_name[r1.idxmax()]}")
    # island and military-base counties (신안·옹진·울릉, 화천·인제·양구) sit near 0.78-0.85 because
    # the survey frame excludes much of their registered population; a wrong pairing would land far outside
    pop15 = t.pop_total - t.pop_age_0_14
    r2 = (t.lfs_pop15p_k * 1000 / pop15).dropna()
    check("고용조사 15세+ / 주민등록 15세+ 0.70–1.30", r2.between(0.70, 1.30).all(),
          f"범위 {r2.min():.3f}–{r2.max():.3f}; 최소 {t.lgu_name[r2.idxmin()]}")
    g = t[t.lgu_name == "고성군"].set_index("sido_name")
    ok_pair = (g.lfs_pop15p_k * 1000 / pop15[g.index.map(lambda s: t[(t.lgu_name == "고성군") & (t.sido_name == s)].index[0])].values)
    swapped = g.lfs_pop15p_k.values[::-1] * 1000 / ok_pair.index.map(
        lambda s: pop15[t[(t.lgu_name == "고성군") & (t.sido_name == s)].index[0]]).values
    check("고성군(강원·경남): 현재 대응이 맞바꾼 대응보다 1에 가까움",
          (abs(ok_pair.values - 1) < abs(swapped - 1)).all(),
          f"현재 {[round(float(x), 2) for x in ok_pair.values]} / 맞바꿈 {[round(float(x), 2) for x in swapped]}")
    r3 = t.employees / t.pop_total
    check("종사자/인구 0.1–5.0(도심 구는 3 이상)", r3.between(0.1, 5.0).all(),
          f"범위 {r3.min():.2f}–{r3.max():.2f}; 최대 {t.sido_name[r3.idxmax()]} {t.lgu_name[r3.idxmax()]}")
    r4 = t.households_rr / t.census_households
    check("주민등록 세대/센서스 가구 0.8–1.6", r4.between(0.8, 1.6).all(), f"범위 {r4.min():.2f}–{r4.max():.2f}")

    # ---- secrets -------------------------------------------------------------------------
    secrets = [v for k, v in _parse(REPO_ROOT / ".env.local").items() if k != "ATLAS_KEYFILE" and len(v) >= 6]
    keyfile = args.keyfile or default_keyfile()
    if keyfile:
        secrets += [v for k, v in _parse(__import__("pathlib").Path(keyfile)).items() if k in LEGACY_NAMES and len(v) >= 6]
    if secrets:
        scan = list((DER).rglob("*.csv")) + list((REPO_ROOT / "data" / "manifests").glob("*.json")) \
            + list((REPO_ROOT / "scripts" / "sgg2025").glob("*.py")) + list(RAW.glob("*.json"))
        leaked = [p.name for p in scan if any(s in p.read_text(encoding="utf-8", errors="ignore") for s in secrets)]
        check(f"키 유출 없음({len(scan)}개 파일 검사)", not leaked, leaked)

    w = max(len(n) for n, _, _ in res)
    for n, ok, d in res:
        print(f"{'PASS' if ok else 'FAIL'}  {n.ljust(w)}  {d}")
    print(f"\n{sum(o for _, o, _ in res)}/{len(res)} 통과")
    sys.exit(0 if all(o for _, o, _ in res) else 1)


if __name__ == "__main__":
    main()
