#!/usr/bin/env python3
"""Chain neighbouring-layer edges into a crosswalk from any layer to a later base
layer (design v2.1, 2-4), and export the standard ones.

    python scripts/region_registry/crosswalk_chain.py               # standard exports
    python scripts/region_registry/crosswalk_chain.py --level lgu --from 2010-12-31 --to 2025-12-31

w_src  (area) / w_src_pop (population): share of the source unit's value that goes to
       the target; multiplied along the path, summed over paths. Use for counts.
w_tgt  / w_tgt_pop: share of the target coming from each source, from the source's
       area / population (SGIS output areas; census year nearest the source layer) times
       w_src. Use to average rates.
alloc  : True when any step of the path split the unit (area_* methods).

General-gu that were merged into their city and later split out again (부천 2016 -> 2024)
are chained through their dongs instead (gu_cycles, via_dongs): the city-only layers in
between would otherwise spread each old gu over all new gu by area.

Outputs: data/derived/region-registry/crosswalk/<level>_to_<base>.csv
"""

from __future__ import annotations

import argparse
from functools import lru_cache
from pathlib import Path

import geopandas as gpd
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
REG = REPO_ROOT / "data" / "derived" / "region-registry"
OUT = REG / "crosswalk"
CACHE = REPO_ROOT / "data" / "raw" / "admdongkor"
OA = REPO_ROOT / "data" / "raw" / "sgis" / "oa-2025"
STANDARD = {"lgu": ["2025-12-31", "2026-10-01"], "sgg": ["2025-12-31", "2026-10-01"], "admdong": ["2026-10-01"]}


@lru_cache(maxsize=1)
def edges() -> pd.DataFrame:
    return pd.read_parquet(REG / "crosswalk_edges.parquet")


@lru_cache(maxsize=1)
def layers() -> pd.DataFrame:
    return pd.read_csv(REG / "layers.csv", dtype=str)


@lru_cache(maxsize=1)
def units() -> pd.DataFrame:
    return pd.read_parquet(REG / "region_units.parquet").set_index("code")


@lru_cache(maxsize=None)
def measures(level: str, date: str) -> pd.DataFrame:
    """Area (m2) and census population of each unit of a layer, from the layer's boundary version.
    The census year is the one nearest the layer date (pop_year_for: 2015 / 2020 / 2024)."""
    lb = pd.read_csv(REG / "layer_boundaries.csv", dtype=str).set_index("layer_id")
    version = lb.loc[f"kr-{level}@{date}", "boundary_version"]
    from build_crosswalk import boundary, pop_year_for  # same loaders (cache in data/raw/admdongkor)
    g = boundary(version, level)
    s = pd.read_csv(OA / f"oa_stats_{pop_year_for(date)}.csv", dtype=str, usecols=["adm_cd", "tot_ppltn"])
    pts = gpd.read_file(OA / "oa_2025.gpkg", columns=["oa_cd"])
    pts = gpd.GeoDataFrame({"pop": pts.oa_cd.astype(str).map(dict(zip(s.adm_cd, pd.to_numeric(s.tot_ppltn.replace("N/A", None),
                                                                                                errors="coerce").fillna(0))))},
                           geometry=pts.geometry.representative_point(), crs=pts.crs)
    j = gpd.sjoin(pts, g[["code", "geometry"]], predicate="within").groupby("code")["pop"].sum()
    return pd.DataFrame({"area": g.set_index("code").area, "pop": j}).fillna(0)


@lru_cache(maxsize=1)
def members() -> pd.DataFrame:
    return pd.read_parquet(REG / "layer_units.parquet")


def gu_cycles(level: str, start: str, end: str) -> set[str]:
    """General-gu merged into their own city and later split out of it again within
    (start, end] (부천: gu abolished 2016-07, re-created 2024-01). A chain through the
    city-only layers forgets which gu the land came from, so these sources go via dongs."""
    if level != "sgg":
        return set()
    e = pd.read_csv(REG / "events.csv", dtype=str).fillna("")
    e = e[e.level == "sgg"]
    out: set[str] = set()
    for mg in e[(e.type == "merge") & (e.date_start > start) & (e.date_start <= end)].itertuples():
        gus = mg.from_codes.split("|")
        if "|" in mg.to_codes or any(units().loc[g].parent_code != mg.to_codes for g in gus):
            continue
        if ((e.type == "split") & (e.from_codes == mg.to_codes) & (e.date_start > mg.date_start) & (e.date_start <= end)).any():
            out |= set(gus)
    return out


def via_dongs(level: str, start: str, end: str, sources: set[str]) -> pd.DataFrame:
    """w_src / w_src_pop of the given sources from the admdong chain: each dong's share of
    its source unit (area, population of the start layer) times the dong's own chain,
    summed by the unit the target dong belongs to at `end`. Sources whose dongs have no
    measures (boundary version lag) are left out; the caller keeps their plain chain."""
    m = members()

    def unit_of(dongs, date):
        layer = set(m[m.layer_id == f"kr-{level}@{date}"].code)
        out = {}
        for d in dongs:
            p = units().loc[d].parent_code
            while isinstance(p, str) and p not in layer:
                p = units().loc[p].parent_code if p in units().index else None
            out[d] = p
        return out

    dc = chain("admdong", start, end)[["from_code", "to_code", "w_src", "w_src_pop"]]
    dc["src"] = dc.from_code.map(unit_of(dc.from_code.unique(), start))
    dc = dc[dc.src.isin(sources)].copy()
    dc["tgt"] = dc.to_code.map(unit_of(dc.to_code.unique(), end))
    meas = measures("admdong", start)
    dc["a"], dc["p"] = dc.from_code.map(meas.area).fillna(0), dc.from_code.map(meas["pop"]).fillna(0)
    once = dc.drop_duplicates("from_code").groupby("src")[["a", "p"]].sum()
    dc = dc[dc.src.map(once.a) > 0]
    dc["w_src"] = dc.w_src * dc.a / dc.src.map(once.a)
    dc["w_src_pop"] = dc.w_src_pop * dc.p / dc.src.map(once.p).where(lambda s: s > 0)
    dc["w_src_pop"] = dc.w_src_pop.fillna(dc.w_src)
    g = dc.groupby(["src", "tgt"], as_index=False)[["w_src", "w_src_pop"]].sum()
    return g.rename(columns={"src": "from_code", "tgt": "to_code"}).assign(alloc=True)


def chain(level: str, start: str, end: str) -> pd.DataFrame:
    dates = sorted(layers()[layers().level == level].reference_date)
    if start not in dates or end not in dates or start > end:
        raise SystemExit(f"{level}: need layer dates with start <= end ({start}, {end})")
    m = members()
    cur = pd.DataFrame({"from_code": sorted(m[m.layer_id == f"kr-{level}@{start}"].code)})
    cur["to_code"], cur["w_src"], cur["w_src_pop"], cur["alloc"] = cur.from_code, 1.0, 1.0, False
    e = edges()[edges().level == level]
    for t0, t1 in zip(dates[dates.index(start):dates.index(end)], dates[dates.index(start) + 1:dates.index(end) + 1]):
        step = e[e.from_layer == f"kr-{level}@{t0}"][["from_code", "to_code", "w_src", "w_src_pop", "method"]]
        j = cur.merge(step.rename(columns={"from_code": "to_code", "to_code": "next", "w_src": "ws", "w_src_pop": "wp"}),
                      on="to_code", how="left")
        if j.next.isna().any():
            lost = j[j.next.isna()].to_code.unique()[:5]
            raise SystemExit(f"{level} {t0}->{t1}: no edge for {lost}")
        j["w_src"] *= j.ws
        j["w_src_pop"] *= j.wp
        j["alloc"] = j.alloc | j.method.str.startswith("area")
        cur = (j.drop(columns=["to_code"]).rename(columns={"next": "to_code"})
               .groupby(["from_code", "to_code"], as_index=False).agg(w_src=("w_src", "sum"), w_src_pop=("w_src_pop", "sum"),
                                                                      alloc=("alloc", "max")))
    cycles = gu_cycles(level, start, end)
    if cycles:
        vd = via_dongs(level, start, end, cycles)
        cur = pd.concat([cur[~cur.from_code.isin(set(vd.from_code))], vd], ignore_index=True)
    meas = measures(level, start)
    cur["contrib"] = cur.w_src * cur.from_code.map(meas.area).fillna(0)
    cur["contrib_pop"] = cur.w_src_pop * cur.from_code.map(meas["pop"]).fillna(0)
    for c, t in (("contrib", "w_tgt"), ("contrib_pop", "w_tgt_pop")):
        tot = cur.groupby("to_code")[c].transform("sum")
        n = cur.groupby("to_code").from_code.transform("size")
        cur[t] = (cur[c] / tot).where(tot > 0, 1 / n)
    u = units()
    nm = lambda c: u.loc[c]["name"] if c in u.index else ""
    sd = lambda c: u.loc[c].sido_name if c in u.index else ""
    cur.insert(0, "from_date", start)
    cur.insert(1, "to_date", end)
    cur["from_name"], cur["from_sido"] = cur.from_code.map(nm), cur.from_code.map(sd)
    cur["to_name"], cur["to_sido"] = cur.to_code.map(nm), cur.to_code.map(sd)
    return cur[["from_date", "to_date", "from_code", "from_sido", "from_name", "to_code", "to_sido", "to_name",
                "w_src", "w_src_pop", "w_tgt", "w_tgt_pop", "alloc"]]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--level")
    ap.add_argument("--from", dest="start")
    ap.add_argument("--to", dest="end")
    ap.add_argument("--levels", nargs="*", default=list(STANDARD))
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if args.level:
        df = chain(args.level, args.start, args.end)
        print(df[df.alloc].to_string(index=False))
        return
    for level in args.levels:
        dates = sorted(layers()[layers().level == level].reference_date)
        for base in STANDARD[level]:
            frames = [chain(level, d, base) for d in dates if d <= base]
            out = pd.concat(frames, ignore_index=True)
            name = f"{level}_to_{base.replace('-', '')}"
            out.to_csv(OUT / f"{name}.csv", index=False, encoding="utf-8")
            print(f"{name}: {len(out)} rows, {out[out.alloc].groupby('from_date').size().sum()} split rows", flush=True)


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()
