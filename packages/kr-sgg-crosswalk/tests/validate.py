"""시군구 연결표 v0.3 검증. 패키지 폴더에서: python tests/validate.py
(examples를 먼저 실행하면 변환 결과와 Python·R 비교도 포함)"""
import hashlib
import json
import sys
import warnings
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "code"))
from harmonize import check_totals, harmonize, load_crosswalk, load_units, to_lgu  # noqa: E402

res = []


def check(name, ok, detail=""):
    res.append((name, bool(ok), str(detail)))


N = {("lgu", "20251231"): 229, ("sgg", "20251231"): 252, ("lgu", "20261001"): 230, ("sgg", "20261001"): 256}
units = {lv: load_units(ROOT / "units" / f"{lv}_units_by_year.csv") for lv in ("lgu", "sgg")}
for (lv, base), n in N.items():
    cw = load_crosswalk(ROOT / "crosswalk" / f"crosswalk_{lv}_to_base{base}.csv")
    errs = {c: (cw.groupby(["year", "src_code10"])[c].sum() - 1).abs().max() for c in ("w_src", "w_src_pop")}
    errs |= {c: (cw.groupby(["year", "tgt_code10"])[c].sum() - 1).abs().max() for c in ("w_tgt", "w_tgt_pop")}
    check(f"[{lv}→{base}] 원천 몫·대상 몫 합 = 1 (면적·인구)", max(errs.values()) < 1e-6, {k: f"{v:.0e}" for k, v in errs.items()})
    k = cw.groupby("year").tgt_code.nunique()
    check(f"[{lv}→{base}] 모든 연도에서 기준 단위 {n}개가 모두 값을 받음", (k == n).all(), f"{k.min()}–{k.max()}")
    U = units[lv][units[lv].layer_date <= f"{base[:4]}-{base[4:6]}-{base[6:]}"]
    a, b = set(zip(U.year.astype(int), U.code10)), set(zip(cw.year.astype(int), cw.src_code10))
    check(f"[{lv}→{base}] 연도별 원천 단위 전부 포함", a == b, f"누락 {len(a - b)}, 초과 {len(b - a)}")
    check(f"[{lv}→{base}] 연도·코드가 겹치지 않음(5자리 행안부 코드가 그 해 유일)",
          not cw.drop_duplicates(["year", "src_code10"]).duplicated(["year", "src_code"]).any())

# ---- base units: 229, not 228 -------------------------------------------------------------------
b25 = units["lgu"][units["lgu"].layer_date == "2025-12-31"].set_index("code")
check("2025-12-31 기초 단위 229개, 증평군 43745 포함", len(b25) == 229 and b25.loc["43745", "name"] == "증평군")
want = {"11215": "광진구", "11305": "강북구", "11545": "금천구", "28177": "미추홀구", "28185": "연수구",
        "28237": "부평구", "28245": "계양구", "29155": "남구"}
got = {c: b25.loc[c, "name"] if c in b25.index else None for c in want}
check("끝자리가 0이 아닌 자치구 8곳 코드 그대로(v0.2 버그 수정)", got == want, got)

# ---- cases ----------------------------------------------------------------------------------------
cw = load_crosswalk(ROOT / "crosswalk" / "crosswalk_lgu_to_base20251231.csv")


def maps(c, y, name, sido=None, col="w_src"):
    g = c[(c.year == y) & (c.src_name == name)]
    if sido:
        g = g[g.src_sidonm == sido]
    return dict(zip(g.tgt_name, g[col].round(3)))


check("코드 재부여: 강원 철원군 2015 → 철원군 1:1", maps(cw, 2015, "철원군") == {"철원군": 1.0}, maps(cw, 2015, "철원군"))
g = cw[(cw.year == 2022) & (cw.src_name == "군위군")]
check("소속 변경: 군위군 2022(경북) → 대구 군위군", len(g) == 1 and g.tgt_sidonm.iloc[0] == "대구광역시" and g.w_src.iloc[0] == 1)
check("통합: 마산시·진해시 2009 → 창원시", maps(cw, 2009, "마산시") == {"창원시": 1.0} and maps(cw, 2009, "진해시") == {"창원시": 1.0})
check("흡수: 청원군 2013 → 청주시", maps(cw, 2013, "청원군") == {"청주시": 1.0}, maps(cw, 2013, "청원군"))
check("세종 출범: 연기군 2011 → 세종", maps(cw, 2011, "연기군") == {"세종특별자치시": 1.0}, maps(cw, 2011, "연기군"))
m = maps(cw, 2011, "공주시")
check("세종 편입: 공주시 2011 → 공주시 + 세종(면적 8.2%)", set(m) == {"공주시", "세종특별자치시"} and abs(m["세종특별자치시"] - 0.082) < 0.01, m)
m = maps(cw, 2011, "청원군")
check("세종 편입: 청원군 2011 → 청원군 + 세종(면적 3.4%, 부용면 일부)", abs(m.get("세종특별자치시", 0) - 0.034) < 0.01, m)
check("명칭 변경: 인천 남구 2017 → 미추홀구", maps(cw, 2017, "남구", "인천광역시") == {"미추홀구": 1.0})
check("한 단위 유지: 부천시 2020 → 부천시 (기초 단위)", maps(cw, 2020, "부천시") == {"부천시": 1.0})
cs = load_crosswalk(ROOT / "crosswalk" / "crosswalk_sgg_to_base20251231.csv")
m = maps(cs, 2010, "부천시 원미구")
check("일반구 폐지·부활: 부천 원미구 2010 → 원미구 2025 ≥ 95%", m.get("부천시 원미구", 0) >= 0.95, m)
m = maps(cs, 2013, "청주시 상당구")
check("일반구 재편: 청주 상당구 2013 → 청원구 일부", m.get("청주시 청원구", 0) > 0.3, m)
c26 = load_crosswalk(ROOT / "crosswalk" / "crosswalk_lgu_to_base20261001.csv")
m = maps(c26, 2025, "중구", "인천광역시")
check("2026 인천 개편: 중구 2025 → 영종구 면적 89%", abs(m.get("영종구", 0) - 0.891) < 0.02, m)

# ---- codes ----------------------------------------------------------------------------------------
s25 = units["sgg"][units["sgg"].layer_date == "2025-12-31"]
check("통계청 코드: 일반구 구분 단위는 모두 있고 해마다 유일",
      (units["sgg"].kostat != "").all() and not units["sgg"].duplicated(["year", "kostat"]).any(),
      f"빈 칸 {(units['sgg'].kostat == '').sum()}")
k25 = dict(zip(s25.name, s25.kostat))
check("통계청 코드: 종로구 11010, 수원 장안구 31011, 증평군 33590 (국가데이터처 연계정보와 같음)",
      k25.get("종로구") == "11010" and k25.get("수원시 장안구") == "31011" and k25.get("증평군") == "33590",
      {n: k25.get(n) for n in ("종로구", "수원시 장안구", "증평군")})
lu = units["lgu"]
su = units["sgg"]
gu_rows = su[su.code10 != su.lgu_code10]
has_gu = set(zip(gu_rows.year, gu_rows.lgu_code10))
city_gu = lu[(lu.kostat == "") & pd.Series([k in has_gu for k in zip(lu.year, lu.code10)], index=lu.index)]
check("기초 단위에서 통계청 코드가 빈 곳은 일반구가 있는 시뿐", (lu.kostat == "").sum() == len(city_gu),
      f"빈 칸 {(lu.kostat == '').sum()}, 그중 일반구 있는 시 {len(city_gu)}")
sg = units["sgg"]
check("일반구 소속(lgu_code)은 모두 그 해 기초 단위", set(zip(sg.year, sg.lgu_code)) <= set(zip(units["lgu"].year, units["lgu"].code)))

# ---- events ----------------------------------------------------------------------------------------
ev = pd.read_csv(ROOT / "crosswalk" / "events_lgu.csv", dtype=str)
check("기초 단위 사건 67건(코드 재부여 60 + 통합·명칭·흡수·개편 7)", len(ev) == 67 and (ev.type == "recode").sum() == 60,
      ev.type.value_counts().to_dict())

# ---- harmonize ----------------------------------------------------------------------------------
df = pd.read_csv(ROOT / "examples" / "example_synthetic_input_lgu.csv", dtype={"code": str})
for w in ("area", "pop"):
    p = harmonize(df, cw, extensive=["pop"], intensive=["aged_pct"], intensive_weight="pop", weights=w)
    t = check_totals(df, p, "pop")
    check(f"변환 전후 연도별 합계 같음 (weights={w})", t.diff_pct.abs().max() < 1e-6 and p.groupby("year").tgt_code.nunique().eq(229).all())
sd = units["sgg"][units["sgg"].year.astype(int) <= 2025][["year", "code", "kostat", "pop_census"]].copy()
sd["pop_census"] = sd.pop_census.astype(float)
c_sgg = load_crosswalk(ROOT / "crosswalk" / "crosswalk_sgg_to_base20251231.csv")
a = harmonize(sd, c_sgg, extensive=["pop_census"], code_system="mois")
with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    b = harmonize(sd.drop(columns="code").rename(columns={"kostat": "code"}), c_sgg, extensive=["pop_census"], code_system="kostat")
check("통계청 코드로 넣어도 행안부 코드와 같은 결과", len(a) == len(b) and (a.pop_census - b.pop_census).abs().max() < 1e-6)
lg = to_lgu(sd[["year", "code", "pop_census"]], units["sgg"])
ref = units["lgu"][units["lgu"].year.astype(int) <= 2025].set_index(["year", "code"]).pop_census.astype(float)
mm = lg.set_index(["year", "code"]).pop_census
both = pd.concat([mm.rename("gu"), ref.rename("lgu")], axis=1)
measured = both.dropna()  # 경계판에 아직 없는 단위(2016 부천시)는 인구가 비어 있다
rel = ((measured.gu - measured.lgu).abs() / measured.lgu.clip(lower=1)).max()
check("to_lgu: 일반구 합 = 기초 단위 인구(경계 위 집계구 대표점 오차 1% 이내)",
      len(mm) == len(ref) and rel < 0.01, f"최대 {rel:.2%}, 인구 없는 단위 {len(both) - len(measured)}")

for w in ("area", "pop"):
    rp, pp = ROOT / "examples" / f"example_output_panel_R_{w}.csv", ROOT / "examples" / f"example_output_panel_python_{w}.csv"
    if rp.exists() and pp.exists():
        R = pd.read_csv(rp, dtype={"tgt_code": str})
        P = pd.read_csv(pp, dtype={"tgt_code": str})
        j = P.merge(R, on=["year", "tgt_code"], suffixes=("_py", "_r"))
        d = max((j[f"{v}_py"] - j[f"{v}_r"]).abs().max() for v in ["pop", "aged_pct", "alloc_share"])
        check(f"Python·R 결과 일치 (weights={w})", len(j) == len(P) == len(R) and d < 1e-6, f"최대 차이 {d:.1e}")

# ---- manifest -------------------------------------------------------------------------------------
man = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
bad = [k for k, v in man["files"].items()
       if not (ROOT / k).exists() or hashlib.sha256((ROOT / k).read_bytes()).hexdigest() != v["sha256"]]
check("manifest.json의 파일 해시 일치", not bad, bad[:5])

w = max(len(n) for n, _, _ in res)
for n, ok, d in res:
    print(f"{'PASS' if ok else 'FAIL'}  {n.ljust(w)}  {d}")
print(f"\n{sum(o for _, o, _ in res)}/{len(res)} 통과")
sys.exit(0 if all(o for _, o, _ in res) else 1)
