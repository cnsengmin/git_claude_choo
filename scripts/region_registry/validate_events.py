#!/usr/bin/env python3
"""Validate change events (design v2.1, 2-2 and 2-6).

    python scripts/region_registry/validate_events.py [--kird PATH]

--kird: KIRD's `code/kird.py` (MIT; github.com/nariyoo/kird-korea-immigration).
Its lineage constants are read with `ast.literal_eval` (the file is never run)
and compared with our sgg-level events by direction only.
"""

from __future__ import annotations

import argparse
import ast
import re
import sys
from datetime import date
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
REG = REPO_ROOT / "data" / "derived" / "region-registry"
DEFAULT_KIRD = REPO_ROOT / "data" / "raw" / "external" / "kird" / "kird.py"

res: list[tuple[str, bool, str]] = []


def check(name, ok, detail=""):
    res.append((name, bool(ok), str(detail)))


def norm(s) -> str:
    return re.sub(r"\s+", "", str(s or ""))


def kird_constants(path: Path, names: set[str]) -> dict:
    out = {}
    for node in ast.parse(path.read_text(encoding="utf-8")).body:
        targets = node.targets if isinstance(node, ast.Assign) else [node.target] if isinstance(node, ast.AnnAssign) else []
        for t in targets:
            if isinstance(t, ast.Name) and t.id in names:
                out[t.id] = ast.literal_eval(node.value)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kird", default=str(DEFAULT_KIRD))
    args = ap.parse_args()

    ev = pd.read_csv(REG / "events.csv", dtype=str).fillna("")
    layers = pd.read_csv(REG / "layers.csv", dtype=str)
    members = pd.read_parquet(REG / "layer_units.parquet")

    # ---- completeness: every change between consecutive layers is carried by an event -------------
    for level in ("lgu", "sgg", "admdong"):
        ls = layers[layers.level == level].sort_values("reference_date")
        e = ev[ev.level == level]
        unexplained = []
        for (l1, d1), (l2, d2) in zip(ls[["layer_id", "reference_date"]].values[:-1], ls[["layer_id", "reference_date"]].values[1:]):
            m1 = set(members[members.layer_id == l1].code)
            m2 = set(members[members.layer_id == l2].code)
            win = e[(e.date_start > d1) & (e.date_start <= d2)]
            frm = set("|".join(win.from_codes).split("|")) - {""}
            to = set("|".join(win.to_codes).split("|")) - {""}
            unexplained += [(d2, "out", c) for c in m1 - m2 - frm] + [(d2, "in", c) for c in m2 - m1 - to]
        check(f"[{level}] 이웃 레이어 사이의 모든 증감이 사건으로 설명됨", not unexplained,
              f"{len(unexplained)}건 {unexplained[:4]}")

    # ---- event sanity ----------------------------------------------------------------------------
    rc = ev[ev.type == "recode"]
    # unit name after the sido; for 행정동 the dong name alone (a general-gu may appear or vanish above it)
    key = lambda lv, s: norm(s.split(" ")[-1]) if lv == "admdong" else norm(s.split(" ", 1)[1])
    same = [key(lv, f) == key(lv, t) for lv, f, t in zip(rc.level, rc.from_names, rc.to_names)] if len(rc) else []
    check("recode는 모두 이름이 같은 1:1", all(same) and (rc.n_from == "1").all() and (rc.n_to == "1").all(), f"{len(rc)}건")
    lgu = ev[ev.level == "lgu"]
    check("기초 단위 코드 재부여 60건(강원 18·군위 1·전북 14·광주 5·전남 22)",
          (lgu.type == "recode").sum() == 60, (lgu.type == "recode").sum())
    want = {("2010-07-01", "merge"), ("2012-01-01", "rename"), ("2012-06-30", "rename"), ("2013-09-23", "rename"),
            ("2014-07-01", "absorbed"), ("2018-06-29", "rename"), ("2026-07-01", "reorganize")}
    got = set(zip(lgu[lgu.type != "recode"].date_start, lgu[lgu.type != "recode"].type))
    check("기초 단위 비재부여 사건 7건(창원 통합·당진·연기→세종·여주·청원 흡수·미추홀·인천 개편)", got == want,
          f"없음 {sorted(want - got)} / 추가 {sorted(got - want)}")
    cw = lgu[(lgu.type == "absorbed") & lgu.from_names.str.contains("청원군")]
    check("청원군 흡수 대상 힌트 = 청주시(4311000000)", (cw.absorb_hint == "4311000000").all() and len(cw) == 1)
    inc = ev[(ev.level == "lgu") & (ev.date_start == "2026-07-01") & ev.from_names.str.contains("인천광역시")]
    check("2026-07-01 인천 개편에 광주 구가 섞이지 않음(동명 구 분리)",
          len(inc) == 1 and "전남광주" not in inc.to_names.iloc[0], inc.to_names.tolist())

    # ---- KIRD direction check (2-6) --------------------------------------------------------------
    kp = Path(args.kird)
    if kp.exists():
        k = kird_constants(kp, {"SGG_LINEAGE", "SGG_SPLIT_LINEAGE"})
        sgg = ev[ev.level == "sgg"]
        pairs = [(tuple(a), tuple(b)) for a, b in k["SGG_LINEAGE"]] + \
                [(tuple(a), tuple(t)) for a, bs in k["SGG_SPLIT_LINEAGE"] for t in bs]
        rows, missing, out_of_range = [], [], []
        for (ss, sn), (ts, tn) in pairs:
            src, tgt = norm(f"{ss}{sn}"), norm(f"{ts}{tn}")
            hit = sgg[sgg.from_names.map(lambda s: src in [norm(x) for x in s.split("|")])
                      & sgg.to_names.map(lambda s: tgt in [norm(x) for x in s.split("|")])]
            if len(hit):
                rows.append((f"{ss} {sn}", f"{ts} {tn}", hit.date_start.iloc[0], hit.type.iloc[0]))
            else:
                # lineage before our 2008 start (e.g. 포천군 -> 포천시, 2003) is out of range, not a miss
                (out_of_range if sn.endswith("군") and tn.endswith("시") and sn[:-1] == tn[:-1] and not
                 ev.from_names.str.contains(sn).any() else missing).append(f"{ss} {sn} -> {ts} {tn}")
        check(f"KIRD 계승·분할 {len(pairs)}건이 우리 일반구 구분 사건으로 설명됨(방향만)", not missing,
              f"일치 {len(rows)}, 범위 밖(2008 이전) {out_of_range}, 없음 {missing}")
        for r in rows:
            print("   KIRD", r)
    else:
        check("KIRD 대조", True, f"건너뜀: {kp} 없음")

    w = max(len(n) for n, _, _ in res)
    for n, ok, d in res:
        print(f"{'PASS' if ok else 'FAIL'}  {n.ljust(w)}  {d}")
    print(f"\n{sum(o for _, o, _ in res)}/{len(res)} 통과")
    sys.exit(0 if all(o for _, o, _ in res) else 1)


if __name__ == "__main__":
    main()
