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


def chain(level: str, start: str, end: str) -> pd.DataFrame:
    dates = sorted(layers()[layers().level == level].reference_date)
    if start not in dates or end not in dates or start > end:
        raise SystemExit(f"{level}: need layer dates with start <= end ({start}, {end})")
    m = pd.read_parquet(REG / "layer_units.parquet")
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
