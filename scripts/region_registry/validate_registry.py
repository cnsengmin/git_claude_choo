#!/usr/bin/env python3
"""Validate the unit registry and its dated layers.

    python scripts/region_registry/validate_registry.py [--offices]

--offices also compares sub-office codes with admdongkor's `find_offices()`
(needs `pip install admdongkor` and network access for its index).
Checks that need local inputs (the crosswalk package boundaries, the 2025
table base, SGIS boundaries) are skipped with a note when those files are absent.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT = REPO_ROOT / "data" / "derived" / "region-registry"
PKG = REPO_ROOT / "data" / "raw" / "packages" / "kr-sgg-crosswalk_v0.2" / "boundaries"

# 기초자치단체 + 제주 행정시 + 세종, by year end (known history)
EXPECTED_LGU = {**{f"{y}-12-31": 232 for y in (2008, 2009)}, **{f"{y}-12-31": 230 for y in range(2010, 2014)},
                **{f"{y}-12-31": 229 for y in range(2014, 2026)}, "2026-10-01": 230}

res: list[tuple[str, bool, str]] = []


def check(name, ok, detail=""):
    res.append((name, bool(ok), str(detail)))


def skip(name, why):
    res.append((name, True, f"건너뜀: {why}"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offices", action="store_true")
    args = ap.parse_args()

    u = pd.read_parquet(OUT / "region_units.parquet")
    layers = pd.read_csv(OUT / "layers.csv", dtype=str)
    members = pd.read_parquet(OUT / "layer_units.parquet")
    for c in ("valid_from", "valid_to"):
        u[c] = pd.to_datetime(u[c].replace("", None)).dt.date

    # ---- structure ------------------------------------------------------------------------
    check("코드는 10자리 문자열, 중복 없음", u.code.str.fullmatch(r"\d{10}").all() and u.code.is_unique, len(u))
    check("모든 행의 수준(level) 판정됨", (u.level != "unknown").all(), u[u.level == "unknown"].code.tolist()[:5])
    same_day = u[u.valid_to.notna() & (u.valid_to < u.valid_from)]
    check("생성일=말소일인 코드는 어느 레이어에도 없음", not members.code.isin(same_day.code).any(), f"{len(same_day)}개")

    # ---- counts -----------------------------------------------------------------------------
    lgu = layers[layers.level == "lgu"].set_index("reference_date").unit_count.astype(int)
    bad = {d: (int(lgu.get(d, -1)), n) for d, n in EXPECTED_LGU.items() if int(lgu.get(d, -1)) != n}
    check("연도별 기초 단위 수가 실제 역사와 일치(2008·09=232, 2010–13=230, 2014–25=229, 2026-10-01=230)", not bad, bad or "19개 시점 일치")

    # ---- cross-checks with earlier work --------------------------------------------------------
    def layer_codes5(lid):
        m = members[members.layer_id == lid].merge(u[["code", "code5"]], on="code")
        return set(m.code5)

    for base, lid, n in (("sgg_base20251231.csv", "kr-sgg@2025-12-31", 252), ("sgg_base20261001.csv", "kr-sgg@2026-10-01", 256)):
        p = PKG / base
        if p.exists():
            ref = set(pd.read_csv(p, dtype={"code": str}).code)
            mine = layer_codes5(lid)
            check(f"{lid} = 연결표 패키지 {base}({n}개, 경계 기반)", mine == ref, f"우리만 {sorted(mine - ref)[:5]} / 패키지만 {sorted(ref - mine)[:5]}")
        else:
            skip(f"{lid} vs 패키지", f"{p} 없음")
    p = REPO_ROOT / "data" / "derived" / "region-codes" / "lgu_base_20251231.csv"
    if p.exists():
        ref = set(pd.read_csv(p, dtype={"lgu_code": str}).lgu_code)
        mine = layer_codes5("kr-lgu@2025-12-31")
        check("kr-lgu@2025-12-31 = 2025 시군구 표의 229개 기준", mine == ref, f"우리만 {sorted(mine - ref)} / 표만 {sorted(ref - mine)}")
    else:
        skip("kr-lgu@2025-12-31 vs 2025 표", "lgu_base_20251231.csv 없음")
    p = REPO_ROOT / "data" / "raw" / "sgis" / "boundary-2025" / "sgis_emd_2025.gpkg"
    adm25 = int(layers.set_index("layer_id").loc["kr-admdong@2025-12-31", "unit_count"])
    if p.exists():
        import geopandas as gpd
        n = len(gpd.read_file(p, ignore_geometry=True))
        check("2025-12-31 행정동 수 ≈ SGIS 2025 경계(2025-06-30) 읍면동 수(±20)", abs(adm25 - n) <= 20, f"레지스트리 {adm25} / SGIS {n}")
    else:
        skip("행정동 수 vs SGIS 2025", "SGIS 읍면동 경계 없음")

    # ---- hierarchy -----------------------------------------------------------------------------
    in_layers = u[u.code.isin(members.code)]
    need = in_layers[in_layers.level.isin(["general_gu", "admin_dong"])]
    orphan = need[need.parent_code.isna()]
    check("레이어에 쓰인 일반구·행정동은 모두 상위 단위가 있음(이름+유효기간)", orphan.empty,
          f"{len(orphan)}개: {orphan[['code', 'sido_name', 'sgg_name', 'emd_name']].head(5).values.tolist()}")
    par = u.set_index("code")
    strict = need.dropna(subset=["parent_code"])
    strict = strict[~strict.parent_method.str.endswith("_validity_overlap")]
    alive_parent = [(par.loc[p, "valid_from"] <= f) and (pd.isna(par.loc[p, "valid_to"]) or par.loc[p, "valid_to"] >= f)
                    for p, f in zip(strict.parent_code, strict.valid_from)]
    loose = need[need.parent_method.str.endswith("_validity_overlap")]
    check("상위 단위는 하위 단위 생성일에 살아 있음(날짜가 어긋난 행정안전부 원자료는 '기간 겹침'으로 따로 표시)",
          all(alive_parent), f"{sum(not a for a in alive_parent)}건 위반; 기간 겹침으로 찾은 것 {len(loose)}건"
          + (f" ({', '.join(sorted(set(loose.sido_name + ' ' + loose.sgg_name)))})" if len(loose) else ""))
    gu = in_layers[in_layers.level == "general_gu"]
    check("일반구의 상위는 모두 '시'", gu.parent_code.map(lambda c: str(par.loc[c, "name"]).endswith("시") if isinstance(c, str) else False).all())
    dis = need[need.prefix_parent_agrees == False]  # noqa: E712
    check("이름 기반 상위와 코드 앞자리 상위가 다른 경우는 기록만(정보)", True,
          f"{len(dis)}건" + (f", 예: {dis[['code', 'name', 'parent_code']].head(3).values.tolist()}" if len(dis) else ""))

    # ---- known official events -------------------------------------------------------------------
    def row(name, sido, born=None, level="lgu"):
        g = u[(u.name == name) & (u.sido_name == sido) & (u.level == level)]
        if born:
            g = g[g.valid_from == born]
        return g

    k = {
        "강원 철원군 42780 → 51780 (2023-06-11)":
            row("철원군", "강원도").valid_to.eq(date(2023, 6, 10)).any() and row("철원군", "강원특별자치도", date(2023, 6, 11)).shape[0] == 1,
        "군위군 경북 → 대구 (2023-07-01)":
            row("군위군", "경상북도").valid_to.eq(date(2023, 6, 30)).any() and row("군위군", "대구광역시", date(2023, 7, 1)).shape[0] == 1,
        "전북 → 전북특별자치도 (2024-01-18)": row("전주시", "전북특별자치도", date(2024, 1, 18)).shape[0] == 1,
        # single-tier: the 세종 lgu row has an empty sigungu name, so it is named after the sido
        "세종 출범 (2012-07-01), 연기군 말소": u[(u.level == "lgu") & (u.sido_name == "세종특별자치시")
                                             & (u.sgg_name == "") & (u.valid_from == date(2012, 7, 1))].shape[0] == 1
                                          and row("연기군", "충청남도").valid_to.eq(date(2012, 6, 29)).any(),
        "인천 남구 말소(2018-06-29) → 미추홀구(2018-07-01)": row("미추홀구", "인천광역시", date(2018, 7, 1)).shape[0] == 1,
        "증평군 2025-12-31 현행": "4374500000" in set(members[members.layer_id == "kr-lgu@2025-12-31"].code),
        "화성시 일반구 4개 신설(2026-02-01), 출장소는 단위 아님":
            u[(u.level == "general_gu") & u.name.str.startswith("화성시") & (u.valid_from == date(2026, 2, 1))].shape[0] == 4
            and not members.code.isin(u[u.name.str.contains("화성시동부출장소")].code).any(),
    }
    for name, ok in k.items():
        check(f"공식 사건: {name}", ok)

    # ---- admdongkor sub-office list --------------------------------------------------------------
    if args.offices:
        try:
            import admdongkor
            theirs = admdongkor.find_offices("출장소", by="name")
            theirs_codes = set(theirs.code.astype(str))
            ours = u[u.level.isin(["sub_office", "dong_sub_office"])]
            ours_codes = set(ours.code)
            only_theirs = sorted(theirs_codes - ours_codes)
            # admdongkor's list is only of offices that ever existed; ours also counts offices born and voided the same day
            only_ours = ours[~ours.code.isin(theirs_codes) & ~ours.code.isin(same_day.code)]
            classified_other = u[u.code.isin(only_theirs)][["code", "level", "name"]].values.tolist()
            check(f"출장소 판정 = admdongkor find_offices (admdongkor {admdongkor.data_version()}, {len(theirs_codes)}개)",
                  not only_theirs, f"admdongkor에만 {len(only_theirs)} {classified_other[:5]} / 우리에만(당일 말소 제외) {len(only_ours)}"
                  + (f" {only_ours[['code', 'name']].head(5).values.tolist()}" if len(only_ours) else ""))
        except Exception as e:
            skip("admdongkor 출장소 대조", f"{type(e).__name__}: {e}")

    w = max(len(n) for n, _, _ in res)
    for n, ok, d in res:
        print(f"{'PASS' if ok else 'FAIL'}  {n.ljust(w)}  {d}")
    print(f"\n{sum(o for _, o, _ in res)}/{len(res)} 통과")
    sys.exit(0 if all(o for _, o, _ in res) else 1)


if __name__ == "__main__":
    main()
