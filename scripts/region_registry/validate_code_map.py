#!/usr/bin/env python3
"""Validate the per-layer KOSTAT <-> MOIS code maps (design v2.1, 2-5).

    python scripts/region_registry/validate_code_map.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
REG = REPO_ROOT / "data" / "derived" / "region-registry"

res: list[tuple[str, bool, str]] = []


def check(name, ok, detail=""):
    res.append((name, bool(ok), str(detail)))


def main() -> None:
    s = pd.read_csv(REG / "code_map_layers.csv", dtype=str)
    a = pd.read_parquet(REG / "code_map_layers_admdong.parquet")
    chk = pd.read_csv(REG / "code_map_linkage_check.csv", dtype=str)
    lb = pd.read_csv(REG / "layer_boundaries.csv", dtype=str)

    # ---- coverage and one-to-one ----------------------------------------------------------------
    sg = s[s.layer_id.str.startswith("kr-sgg")]
    check("시군구(일반구 구분) 레이어 19개 모두 대응표 있음", sg.layer_id.nunique() == 19, sg.layer_id.nunique())
    per = sg.groupby("layer_id").agg(k=("kostat_final", "nunique"), m=("mois_code", "nunique"), n=("mois_code", "size"))
    check("레이어마다 통계청 시군구 ↔ 행안부 시군구 1:1", ((per.k == per.n) & (per.m == per.n)).all(),
          per[(per.k != per.n) | (per.m != per.n)].to_dict("index"))
    bnd = lb[lb.level == "sgg"].set_index("layer_id").n_boundary.astype(int)
    check("시군구 대응 수 = 경계판 시군구 수(모든 레이어)", (per.n == bnd.reindex(per.index)).all())
    lg = s[s.layer_id.str.startswith("kr-lgu")]
    check("기초 단위 대응: 모든 통계청 시군구가 행안부 기초 단위 하나로 접힘", lg.mois_code.notna().all(),
          int(lg.mois_code.isna().sum()))
    check("행정동 대응 1:1(중복·소수 오류 정리 뒤)", a.one_to_one.all(), int((~a.one_to_one).sum()))

    # ---- official linkage -----------------------------------------------------------------------
    s25 = sg[sg.layer_id == "kr-sgg@2025-12-31"]
    check("2025-12-31 시군구 252쌍 = 국가데이터처 연계정보(2025-10-01판)",
          len(s25) == 252 and (s25.kostat_code == s25.kostat_official).all(),
          f"공식 코드 있는 행 {s25.kostat_official.notna().sum()}, 경계 코드와 다른 행 {(s25.kostat_code != s25.kostat_official).sum()}")
    s26 = sg[sg.layer_id == "kr-sgg@2026-10-01"]
    check("2026-10-01 시군구는 공식 코드로 대체(경계 코드와 다른 곳 = 2026-07 개편 지역)",
          s26.kostat_official.notna().all() and (s26.kostat_final == s26.kostat_official).all(),
          f"대체 {(s26.kostat_code != s26.kostat_official).sum()}건: "
          + ", ".join(sorted(set(s26[s26.kostat_code != s26.kostat_official].mois_name))))
    old = pd.read_csv(REPO_ROOT / "data" / "derived" / "region-codes" / "sgg_code_map_20251231.csv", dtype=str)
    old = set(zip(old[(old.code_system == "KOSTAT5") & old.mois_sgg_code.notna()].code,
                  old[(old.code_system == "KOSTAT5") & old.mois_sgg_code.notna()].mois_sgg_code + "00000"))
    check("3단계의 SGIS 경계 겹침 대응표(252쌍) = 이 레이어 대응표", old == set(zip(s25.kostat_final, s25.mois_code)),
          f"차이 {sorted(old ^ set(zip(s25.kostat_final, s25.mois_code)))[:4]}")
    known = {"ours_only", "official_only", "no_polygon_unit", "kostat_code_differs"}
    check("연계정보와의 행정동 차이는 알려진 갈래뿐(시점·경계 없음·코드 다름)", set(chk.reason) <= known,
          chk.groupby(["layer_id", "reason"]).size().to_dict())
    k25 = chk[(chk.layer_id == "kr-admdong@2025-12-31")]
    check("2025-12-31 행정동: 공식(10-01판)과 다른 곳 30건 이하(분기 사이 신설·폐지 포함)", len(k25) <= 30, len(k25))

    w = max(len(n) for n, _, _ in res)
    for n, ok, d in res:
        print(f"{'PASS' if ok else 'FAIL'}  {n.ljust(w)}  {d}")
    print(f"\n{sum(o for _, o, _ in res)}/{len(res)} 통과")
    sys.exit(0 if all(o for _, o, _ in res) else 1)


if __name__ == "__main__":
    main()
