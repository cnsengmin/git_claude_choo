#!/usr/bin/env python3
"""Validate crosswalk edges and chained crosswalks (design v2.1, 2-4).

    python scripts/region_registry/validate_crosswalk.py

Optional comparisons run when their inputs exist locally:
  kr-sgg-crosswalk v0.2 (data/raw/packages/...)   lgu chain -> 2025-12-31, by sido + name
  seoul-dong-panel v0.1 (data/raw/packages/...)    admdong chain -> 2026-10-01, Seoul
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
REG = REPO_ROOT / "data" / "derived" / "region-registry"
PKG = REPO_ROOT / "data" / "raw" / "packages"
SIDO_ALIAS = {"강원도": "강원특별자치도", "전라북도": "전북특별자치도"}

res: list[tuple[str, bool, str]] = []


def check(name, ok, detail=""):
    res.append((name, bool(ok), str(detail)))


def norm(s) -> str:
    return re.sub(r"\s+", "", str(s))


def descendants(codes: set[str], level: str) -> set[str]:
    """Base-layer units reached from the given new-land units by the chained crosswalk."""
    out = set(codes)
    e = pd.read_parquet(REG / "crosswalk_edges.parquet")
    e = e[e.level == level]
    frontier = set(codes)
    while frontier:
        nxt = set(e[e.from_code.isin(frontier)].to_code.dropna()) - out
        out |= nxt
        frontier = nxt
    return out


def main() -> None:
    e = pd.read_parquet(REG / "crosswalk_edges.parquet")
    import json
    nosrc = json.loads((REG / "crosswalk_edges.manifest.json").read_text(encoding="utf-8")).get("targets_without_source", [])
    nosrc_set = {(r["to_layer"], r["code"]) for r in nosrc}
    m = pd.read_parquet(REG / "layer_units.parquet")

    # ---- edges ------------------------------------------------------------------------------------
    for col in ("w_src", "w_src_pop"):
        s = e.groupby(["from_layer", "from_code"])[col].sum()
        check(f"이웃 시점 연결: 원천 단위마다 {col} 합 = 1", (s - 1).abs().max() < 1e-9, f"최대 오차 {(s - 1).abs().max():.1e}")
    for col in ("w_tgt", "w_tgt_pop"):
        t = e.dropna(subset=["to_code"]).groupby(["to_layer", "to_code"])[col].sum()
        check(f"이웃 시점 연결: 대상 단위마다 {col} 합 = 1", (t - 1).abs().max() < 1e-6, f"최대 오차 {(t - 1).abs().max():.1e}")
    miss_src = set(zip(m.layer_id, m.code)) - set(zip(e.from_layer, e.from_code)) - \
        {(l, c) for l, c in zip(m.layer_id, m.code) if l.endswith("2026-10-01")}
    check("마지막 레이어를 뺀 모든 레이어 단위가 원천으로 등장", not miss_src, f"{len(miss_src)} {sorted(miss_src)[:3]}")
    miss_tgt = {(l, c) for l, c in zip(m.layer_id, m.code) if not l.endswith("2008-12-31")} - set(zip(e.to_layer, e.to_code))
    check("첫 레이어를 뺀 모든 레이어 단위가 대상으로 등장(새 땅으로 기록된 단위만 예외)", miss_tgt == nosrc_set,
          f"새 땅 {sorted(nosrc_set)}; 기록 없이 빠진 것 {sorted(miss_tgt - nosrc_set)[:3]}")
    bad_to = set(zip(e.to_layer, e.to_code.fillna(""))) - set(zip(m.layer_id, m.code))
    check("연결 대상은 모두 대상 레이어의 단위", not bad_to, f"{len(bad_to)} {sorted(bad_to)[:3]}")
    check("미해결(경계 없음) 연결 0건", (e.method != "unresolved_no_polygon").all(), int((e.method == "unresolved_no_polygon").sum()))
    py = e.dropna(subset=["pop_year_wanted"])
    check("인구 가중이 사건 시점에 맞는 인구총조사 연도를 씀(대체 연도 0건)", (py.pop_year == py.pop_year_wanted).all(),
          py.pop_year.value_counts().sort_index().to_dict())

    def w(level, frm, src_name, tgt_name, col="w_src"):
        x = e[(e.level == level) & (e.from_layer == f"kr-{level}@{frm}")]
        u = pd.read_parquet(REG / "region_units.parquet").set_index("code")
        x = x[x.from_code.map(lambda c: u.loc[c]["name"] if c in u.index else "") == src_name]
        x = x[x.to_code.map(lambda c: u.loc[c]["name"] if isinstance(c, str) and c in u.index else "") == tgt_name]
        return round(float(x[col].sum()), 3)

    cases = {
        "청원군 → 청주시 (lgu 2013→2014) = 1": w("lgu", "2013-12-31", "청원군", "청주시") == 1.0,
        "공주시 → 세종 면적 8.2% (2011→2012)": abs(w("lgu", "2011-12-31", "공주시", "세종특별자치시") - 0.082) < 0.01,
        "청원군 → 세종 면적 3.4% (2011→2012, 부용면 일부)": abs(w("lgu", "2011-12-31", "청원군", "세종특별자치시") - 0.034) < 0.01,
        "연기군 → 세종 = 1": w("lgu", "2011-12-31", "연기군", "세종특별자치시") == 1.0,
        "인천 중구 → 영종구 면적 89% (2025→2026-10)": abs(w("lgu", "2025-12-31", "중구", "영종구") - 0.891) < 0.02,
        "청주 상당구 → 청원구 일부 (sgg 2013→2014, 코드 유지 단위의 재편)": w("sgg", "2013-12-31", "청주시 상당구", "청주시 청원구") > 0.3,
    }
    sc = pd.read_csv(REG / "crosswalk" / "sgg_to_20251231.csv", dtype=str)
    wm = sc[(sc.from_date == "2010-12-31") & (sc.from_name == "부천시 원미구") & (sc.to_name == "부천시 원미구")].w_src.astype(float).sum()
    cases[f"부천 원미구 2010 → 원미구 2025 ≥ 95% (일반구 폐지·부활을 행정동으로 이음, {wm:.3f})"] = wm >= 0.95
    for k, ok in cases.items():
        check(f"사례: {k}", ok)

    # ---- chains -----------------------------------------------------------------------------------
    cw_dir = REG / "crosswalk"
    for f in sorted(cw_dir.glob("*.csv")):
        c = pd.read_csv(f, dtype={"from_code": str, "to_code": str})
        s = c.groupby(["from_date", "from_code"]).w_src.sum()
        t = c.groupby(["from_date", "to_code"]).w_tgt.sum()
        level, base = f.stem.split("_to_")
        n_base = m[m.layer_id == f"kr-{level}@{base[:4]}-{base[4:6]}-{base[6:]}"].code.nunique()
        # a base unit may lack sources before its land existed (new land, see the edges manifest)
        newland = {r["code"] for r in nosrc if r["code"] in set(c.to_code)} |             {r["code"] for r in nosrc if r["level"] == level}
        got = c.groupby("from_date").to_code.nunique()
        full = ((got == n_base) | (got >= n_base - len(newland) - 1)).all() and             all(set(m[m.layer_id == f"kr-{level}@{base[:4]}-{base[4:6]}-{base[6:]}"].code) - set(g.to_code) <= descendants(newland, level)
                for _, g in c.groupby("from_date"))
        check(f"[{f.stem}] w_src·w_tgt 합 = 1, 매년 기준 단위 {n_base}개 모두 받음",
              (s - 1).abs().max() < 1e-6 and (t - 1).abs().max() < 1e-6 and full,
              f"w_src {(s - 1).abs().max():.1e}, w_tgt {(t - 1).abs().max():.1e}")

    # ---- v0.2 package (lgu -> 2025-12-31) --------------------------------------------------------
    v2p = PKG / "kr-sgg-crosswalk_v0.2" / "crosswalk" / "crosswalk_lgu_to_base20251231.csv"
    ours_p = cw_dir / "lgu_to_20251231.csv"
    if v2p.exists() and ours_p.exists():
        v2 = pd.read_csv(v2p, dtype=str)
        o = pd.read_csv(ours_p, dtype=str)
        key = lambda sd, nm: SIDO_ALIAS.get(sd, sd) + "|" + norm(nm).replace("세종시", "세종특별자치시")
        v2k = pd.DataFrame({"year": v2.year.astype(int), "src": [key(a, b) for a, b in zip(v2.src_sidonm, v2.src_name)],
                            "tgt": [key(a, b) for a, b in zip(v2.tgt_sidonm, v2.tgt_name)], "w_v2": v2.w_src.astype(float)})
        ok = pd.DataFrame({"year": o.from_date.str[:4].astype(int), "src": [key(a, b) for a, b in zip(o.from_sido, o.from_name)],
                           "tgt": [key(a, b) for a, b in zip(o.to_sido, o.to_name)], "w": o.w_src.astype(float)})
        ok = ok[ok.year.between(v2k.year.min(), v2k.year.max())]  # v0.2 covers 2010-2025
        j = ok.merge(v2k, on=["year", "src", "tgt"], how="outer", indicator=True)
        both = j[j._merge == "both"]
        diff = both[(both.w - both.w_v2).abs() > 0.02]
        # v0.2's known bug: 증평군 folded into 영동군 (code 43740). Anything else is a real difference.
        other = j[(j._merge != "both") & ~j.src.str.contains("증평군|영동군") & ~j.tgt.str.contains("증평군|영동군")]
        # v0.2 kept slivers of units that only changed name (여주군 -> 원주시 in 2010-2012); ours sends them 1:1
        v2_noise = other[(other._merge == "right_only") & (other.w_v2 < 0.02)]
        other = other.drop(v2_noise.index)
        check("v0.2 연결표(기초 단위 → 2025-12-31)와 일치(증평·영동 버그 제외, 면적 몫 ±0.02)",
              diff.empty and other.empty,
              f"일치 {len(both)}행, 몫 차이 {len(diff)}, v0.2만의 2% 미만 조각 {len(v2_noise)}행 {sorted(set(v2_noise.src + '→' + v2_noise.tgt))}, "
              f"그 밖 한쪽만 {len(other)} {other[['year', 'src', 'tgt', '_merge']].head(4).values.tolist()}")
    else:
        check("v0.2 대조", True, "건너뜀: 패키지 없음")

    # ---- Seoul dong panel v0.1 (admdong -> 2026-10-01) -------------------------------------------
    sp = PKG / "seoul-dong-panel_v0.1" / "crosswalk" / "crosswalk_dong_to_base20261001.csv"
    ours_p = cw_dir / "admdong_to_20261001.csv"
    if sp.exists() and ours_p.exists():
        sd = pd.read_csv(sp, dtype={"src_emdcd": str, "tgt_emdcd": str})
        o = pd.read_csv(ours_p, dtype={"from_code": str, "to_code": str})
        o = o[o.from_code.str.startswith("11")].assign(year=lambda d: d.from_date.str[:4].astype(int))
        o = o[o.year.between(sd.year.min(), sd.year.max())]  # v0.1 covers 2010-2025
        j = o.merge(sd.rename(columns={"src_emdcd": "from_code", "tgt_emdcd": "to_code"})[["year", "from_code", "to_code", "w_src"]],
                    on=["year", "from_code", "to_code"], how="outer", suffixes=("", "_v01"), indicator=True)
        both = j[j._merge == "both"]
        close = (both.w_src - both.w_src_v01).abs() <= 0.05
        share = (j._merge == "both").mean()
        check("서울 행정동 패키지 v0.1과 대조(정보): 같은 연결 비율, 몫 ±0.05 비율", True,
              f"같은 연결 {share:.1%}({len(both)}행), 그중 몫 일치 {close.mean():.1%}; 우리만 {(j._merge == 'left_only').sum()}행, "
              f"v0.1만 {(j._merge == 'right_only').sum()}행")
    else:
        check("서울 v0.1 대조", True, "건너뜀: 패키지 없음")

    width = max(len(n) for n, _, _ in res)
    for n, ok, d in res:
        print(f"{'PASS' if ok else 'FAIL'}  {n.ljust(width)}  {d}")
    print(f"\n{sum(o for _, o, _ in res)}/{len(res)} 통과")
    sys.exit(0 if all(o for _, o, _ in res) else 1)


if __name__ == "__main__":
    main()
