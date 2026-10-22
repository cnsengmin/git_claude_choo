#!/usr/bin/env python3
"""Derive change events from the unit registry (design v2.1, 2-2).

    python scripts/region_registry/build_events.py

For each layer level (lgu, sgg, admdong) the set of units in force is computed
on every day it changes. Changes a few days apart (연기군 out 2012-06-30,
세종 in 2012-07-01) form one cluster; within a cluster the units that left
are linked to the units that came in:

  1. by name (MOIS spacing ignored), preferring the same sido: a pair whose
     group has nothing else left over is a `recode` (same name, new code);
  2. what is left is grouped by sido (lgu, sgg) or by city/county (admdong);
     a group's size decides `rename` (1:1, new name), `merge` (n:1),
     `split` (1:n), `reorganize` (n:m), `absorbed` (n:0) or `new` (0:n);
  3. when exactly one group of a cluster lost units and exactly one other gained
     some, the two are joined (연기군 in 충남 -> 세종 in its own sido).

The registry gives dates, not shares: every event other than `recode` is marked
`needs_boundary` and gets its weights from the boundary overlap step (P4).

Output: data/derived/region-registry/events.csv
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
REG = REPO_ROOT / "data" / "derived" / "region-registry"
START, END = date(2008, 1, 1), date(2026, 10, 12)
CLUSTER_GAP = timedelta(days=3)
LAYER_DATES = [date(y, 12, 31) for y in range(2008, 2026)] + [date(2026, 10, 1)]  # as build_registry.py
CITY_GU = re.compile(r"^(.+?시)\s?(.+구)$")


def norm(s) -> str:
    return re.sub(r"\s+", "", str(s or ""))


def load_units() -> pd.DataFrame:
    u = pd.read_parquet(REG / "region_units.parquet")
    for c in ("valid_from", "valid_to"):
        u[c] = pd.to_datetime(u[c].replace("", None)).dt.date
    u["unit_name"] = [n if n else s for n, s in zip(u.sgg_name.where(u.level.isin(["lgu", "general_gu"]), u.name), u.sido_name)]
    u.loc[u.level.isin(["lgu", "general_gu"]), "unit_name"] = [
        g if g else s for g, s in zip(u.loc[u.level.isin(["lgu", "general_gu"]), "sgg_name"],
                                      u.loc[u.level.isin(["lgu", "general_gu"]), "sido_name"])]
    return u


def members(u: pd.DataFrame, level: str, d: date) -> set[str]:
    alive = u[(u.valid_from <= d) & (u.valid_to.isna() | (u.valid_to >= d))]
    if level == "lgu":
        return set(alive[alive.level == "lgu"].code)
    if level == "admdong":
        return set(alive[alive.level == "admin_dong"].code)
    gu = alive[alive.level == "general_gu"]
    cities_with_gu = set(gu.parent_code.dropna())
    return set(gu.code) | set(alive[(alive.level == "lgu") & ~alive.code.isin(cities_with_gu)].code)


def change_dates(u: pd.DataFrame, level: str) -> list[date]:
    lv = {"lgu": ["lgu"], "sgg": ["lgu", "general_gu"], "admdong": ["admin_dong"]}[level]
    rows = u[u.level.isin(lv)]
    ds = set(rows.valid_from.dropna()) | {d + timedelta(days=1) for d in rows.valid_to.dropna()}
    return sorted(d for d in ds if START <= d <= END)


def clusters(ds: list[date]) -> list[tuple[date, date]]:
    """Chain change days at most CLUSTER_GAP apart, but never across a layer's reference
    date: 2008-12-29 and 2009-01-01 changes sit on either side of the 2008-12-31 layer."""
    out: list[list[date]] = []
    for d in ds:
        crosses_layer = out and any(out[-1][-1] <= ld < d for ld in LAYER_DATES)
        if out and d - out[-1][-1] <= CLUSTER_GAP and not crosses_layer:
            out[-1].append(d)
        else:
            out.append([d])
    return [(c[0], c[-1]) for c in out]


def main() -> None:
    u = load_units()
    info = u.set_index("code")
    by_code_parent = info.parent_code.to_dict()

    def name_key(code: str, level: str) -> str:
        r = info.loc[code]
        return norm(r.unit_name) if level != "admdong" else norm(r.sgg_name) + "/" + norm(r["name"])

    def group_key(code: str, level: str) -> str:
        r = info.loc[code]
        if level != "admdong":
            return r.sido_name
        city = CITY_GU.match(r.sgg_name or "")
        return f"{r.sido_name}/{city.group(1) if city else r.sgg_name}"

    events = []
    for level in ("lgu", "sgg", "admdong"):
        for a, b in clusters(change_dates(u, level)):
            before, after = members(u, level, a - timedelta(days=1)), members(u, level, b)
            removed, added = sorted(before - after), sorted(after - before)
            if not removed and not added:
                continue
            # 1. name pairs. First pass: same sido, or a sido that itself ended in this window
            #    (광주광역시 -> 전남광주통합특별시); never across two living sidos, because 동구/서구
            #    of 인천 and 광주 changed on the same day. Second pass: a cross-sido pair only when
            #    the name is unique on both sides of the cluster (군위군 경북 -> 대구).
            ended_sidos = set(u[(u.level == "sido") & u.valid_to.notna() & (u.valid_to >= a - timedelta(days=1))
                                & (u.valid_to <= b)].sido_name)
            pairs, left_r, left_a = [], list(removed), list(added)
            for r in removed:
                rs = info.loc[r].sido_name
                cands = [x for x in left_a if name_key(x, level) == name_key(r, level)
                         and (info.loc[x].sido_name == rs or rs in ended_sidos)]
                if len(cands) == 1:
                    pairs.append((r, cands[0])); left_r.remove(r); left_a.remove(cands[0])
            for r in list(left_r):
                k = name_key(r, level)
                cands = [x for x in left_a if name_key(x, level) == k]
                if len(cands) == 1 and sum(name_key(y, level) == k for y in left_r) == 1:
                    pairs.append((r, cands[0])); left_r.remove(r); left_a.remove(cands[0])
            # 2. groups of leftovers; a name pair joins its group when the group has leftovers
            groups: dict[str, dict[str, list[str]]] = defaultdict(lambda: {"from": [], "to": [], "via": []})
            for r in left_r:
                groups[group_key(r, level)]["from"].append(r)
            for x in left_a:
                groups[group_key(x, level)]["to"].append(x)
            standalone = []
            for r, x in pairs:
                g = groups.get(group_key(r, level)) or groups.get(group_key(x, level))
                if g is not None:
                    g["from"].append(r); g["to"].append(x); g["via"].append("name_pair_in_group")
                else:
                    standalone.append((r, x))
            # 3. one losing group + one gaining group in the cluster -> join
            losing = [k for k, g in groups.items() if g["from"] and not g["to"]]
            gaining = [k for k, g in groups.items() if g["to"] and not g["from"]]
            if len(losing) == 1 and len(gaining) == 1:
                g = groups.pop(gaining[0])
                groups[losing[0]]["to"] += g["to"]
                groups[losing[0]]["via"].append("cross_group_single")

            def emit(frm, to, gkey, method):
                frm, to = sorted(set(frm)), sorted(set(to))
                nr, na = len(frm), len(to)
                same_name = nr == 1 and na == 1 and name_key(frm[0], level) == name_key(to[0], level)
                kind = ("recode" if same_name else "rename" if (nr, na) == (1, 1) else "merge" if na == 1 and nr > 1
                        else "split" if nr == 1 and na > 1 else "absorbed" if na == 0 else "new" if nr == 0 else "reorganize")
                hint = ""
                if kind == "absorbed":
                    # the city whose new general-gu appeared in the same window (청원군 -> 청주시)
                    new_gu = u[(u.level == "general_gu") & (u.valid_from >= a) & (u.valid_from <= b)]
                    sidos = {info.loc[c].sido_name for c in frm}
                    hint = "|".join(sorted({by_code_parent[c] for c in new_gu[new_gu.sido_name.isin(sidos)].code
                                            if isinstance(by_code_parent.get(c), str)}))
                events.append({
                    "level": level, "date_start": a.isoformat(), "date_end": b.isoformat(), "type": kind,
                    "n_from": nr, "n_to": na,
                    "from_codes": "|".join(frm), "from_names": "|".join(f"{info.loc[c].sido_name} {info.loc[c].unit_name if level != 'admdong' else info.loc[c].sgg_name + ' ' + info.loc[c]['name']}".strip() for c in frm),
                    "to_codes": "|".join(to), "to_names": "|".join(f"{info.loc[c].sido_name} {info.loc[c].unit_name if level != 'admdong' else info.loc[c].sgg_name + ' ' + info.loc[c]['name']}".strip() for c in to),
                    "group": gkey, "link_method": method, "needs_boundary": kind != "recode", "absorb_hint": hint,
                })

            for r, x in standalone:
                emit([r], [x], group_key(r, level), "name_pair")
            for k, g in groups.items():
                emit(g["from"], g["to"], k, "+".join(["group"] + sorted(set(g["via"]))))

    ev = pd.DataFrame(events).sort_values(["level", "date_start", "group"]).reset_index(drop=True)
    ev.insert(0, "event_id", [f"{l}-{d.replace('-', '')}-{i:04d}" for i, (l, d) in enumerate(zip(ev.level, ev.date_start))])
    ev.to_csv(REG / "events.csv", index=False, encoding="utf-8")
    print(ev.groupby(["level", "type"]).size().unstack(fill_value=0).to_string())
    print(ev[ev.level == "lgu"][["date_start", "type", "from_names", "to_names", "absorb_hint"]].to_string(index=False))


if __name__ == "__main__":
    main()
