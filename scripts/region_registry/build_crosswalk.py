#!/usr/bin/env python3
"""Crosswalk edges between neighbouring layers, area- and population-weighted
(design v2.1, 2-4).

    python scripts/region_registry/build_crosswalk.py [--levels lgu sgg admdong]

What is split is decided by the official change events (events.csv, P1), not by
boundary differences:
  * a unit in no event that exists in both layers           -> 1:1 (code_1to1)
  * a `recode` pair (same name, new code)                   -> 1:1 (recode)
  * a unit whose code ended in another event                 -> split by area
                                                                (area_abolished_code)
  * a unit that kept its code but gave land to a new unit    -> self + new units
                                                                (area_ceded_to_new, >= 1%)
The overlay rules are those of kr-sgg-crosswalk v0.2 (build/xwalk.py): pieces
narrower than 20 m or under 0.2% and 5,000 m2 are redraw noise; pieces under 5%
going to an existing unit are dropped, pieces going to a new unit are kept.

Boundaries: admdongkor versions (data/raw/admdongkor/<version>/, EPSG:5179);
sources use the latest version before the first event of the window, targets the
first version on or after its last event, falling back to the nearest version
that has the code.

Population: SGIS census output areas on the 2025 boundary, census year chosen per
window (2015 / 2020 / 2024, see pop_year_for). The population of a piece is the sum over output areas whose representative point
falls in it. Where a source's pieces hold nobody, its area weights are used.

Output: data/derived/region-registry/crosswalk_edges.parquet (+ .csv for lgu, sgg)
"""

from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

import admdongkor as adk
import geopandas as gpd
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
REG = REPO_ROOT / "data" / "derived" / "region-registry"
CACHE = REPO_ROOT / "data" / "raw" / "admdongkor"
OA = REPO_ROOT / "data" / "raw" / "sgis" / "oa-2025"

SLIVER_SHARE, SLIVER_AREA, SLIVER_WIDTH, MEANINGFUL = 0.002, 5_000.0, 20.0, 0.05
# a kept unit that gave land to a NEW unit is split from 1% on: 청원군 gave about 3.4% (부용면 일부) to
# 세종 in 2012, below the 5% used for pieces going to existing units; slivers are already removed
CEDED_MIN = 0.01

U = pd.read_parquet(REG / "region_units.parquet").set_index("code")
VERSIONS = sorted(v for v in adk.get_list() if v >= "20070101")


@lru_cache(maxsize=None)
def boundary(version: str, level: str) -> gpd.GeoDataFrame:
    """code (MOIS 10-digit), name, geometry for one version and level."""
    src_level = "emd" if level == "admdong" else "sgg"
    p = CACHE / version / f"{src_level}_detail.parquet"
    if p.exists():
        g = gpd.read_parquet(p)
    else:
        g = adk.get(version, src_level, detail=True)
        for c in g.columns:
            if c != "geometry" and g[c].dtype == object:
                g[c] = g[c].astype("string")
        p.parent.mkdir(parents=True, exist_ok=True)
        g.to_parquet(p)
    if level == "admdong":
        out = gpd.GeoDataFrame({"code": g.emdcd.astype(str), "name": g.emdnm.astype(str)}, geometry=g.geometry, crs=g.crs)
    else:
        out = gpd.GeoDataFrame({"code": g.sggcd.astype(str) + "00000", "name": g.sggnm.astype(str)}, geometry=g.geometry, crs=g.crs)
        if level == "lgu":  # fold general-gu into its city through the registry
            par = out.code.map(lambda c: U.loc[c].parent_code if c in U.index and U.loc[c].level == "general_gu" else c)
            out = out.assign(code=par).dissolve(by="code", as_index=False)
            out["name"] = out.code.map(lambda c: U.loc[c]["name"] if c in U.index else "")
    out = out.dissolve(by="code", as_index=False) if out.code.duplicated().any() else out
    return out.reset_index(drop=True)


def polygons(codes: set[str], level: str, prefer: str, direction: str) -> tuple[gpd.GeoDataFrame, dict[str, str]]:
    """Polygons for codes from the version nearest `prefer` in `direction` ('before'/'after') that has them."""
    order = [v for v in VERSIONS if v <= prefer][::-1] + [v for v in VERSIONS if v > prefer] if direction == "before" \
        else [v for v in VERSIONS if v >= prefer] + [v for v in VERSIONS if v < prefer][::-1]
    got, used = [], {}
    left = set(codes)
    for v in order:
        if not left:
            break
        b = boundary(v, level)
        hit = b[b.code.isin(left)]
        if len(hit):
            got.append(hit)
            used.update({c: v for c in hit.code})
            left -= set(hit.code)
    g = gpd.GeoDataFrame(pd.concat(got, ignore_index=True), crs="EPSG:5179") if got else \
        gpd.GeoDataFrame(columns=["code", "name", "geometry"], geometry="geometry", crs="EPSG:5179")
    return g, used


@lru_cache(maxsize=None)
def lgu_of(code: str) -> str | None:
    """The local government a unit belongs to, through registry parents (admdong -> sigungu -> city)."""
    seen = 0
    while isinstance(code, str) and code in U.index and U.loc[code].level not in ("lgu",) and seen < 4:
        code = U.loc[code].parent_code
        seen += 1
    return code if isinstance(code, str) and code in U.index and U.loc[code].level == "lgu" else None


# 행정동: a small (< 5%) piece reaches a NEW unit only inside the same local government; across a
# municipal border it is redraw noise (서울 구로구 dongs -> 부천 dongs when 부천's dongs were recoded)
POP_YEARS = (2015, 2020, 2024)  # census years SGIS serves on the 2025 output areas (2010 is empty)


def pop_year_for(event_date: str) -> int:
    """The census year nearest the change, not after it when possible: up to 2017 -> 2015,
    2018-2022 -> 2020, 2023 on -> 2024. Population after a change is skewed by what was built
    on the moved land (공주시 -> 세종 2012: 8% of the area, 44% of 2024 residents)."""
    y = int(event_date[:4])
    return 2015 if y <= 2017 else 2020 if y <= 2022 else 2024


@lru_cache(maxsize=1)
def oa_geometry() -> gpd.GeoDataFrame:
    g = gpd.read_file(OA / "oa_2025.gpkg", columns=["oa_cd"])
    return gpd.GeoDataFrame({"oa_cd": g.oa_cd.astype(str)}, geometry=g.geometry.representative_point(), crs=g.crs)


@lru_cache(maxsize=None)
def oa_points(year: int) -> gpd.GeoDataFrame:
    s = pd.read_csv(OA / f"oa_stats_{year}.csv", dtype=str, usecols=["adm_cd", "tot_ppltn"])
    pop = pd.to_numeric(s.tot_ppltn.replace("N/A", None), errors="coerce").fillna(0)  # N/A areas hold no residents (P3)
    g = oa_geometry()
    return g.assign(pop=g.oa_cd.map(dict(zip(s.adm_cd, pop))).fillna(0))


def pop_of(geoms: gpd.GeoSeries, year: int) -> pd.Series:
    pts = oa_points(year)
    j = gpd.sjoin(pts, gpd.GeoDataFrame(geometry=geoms.reset_index(drop=True), crs="EPSG:5179"), predicate="within")
    return j.groupby("index_right")["pop"].sum().reindex(range(len(geoms)), fill_value=0).set_axis(geoms.index)


def window_edges(level: str, t0: str, t1: str, members: pd.DataFrame, events: pd.DataFrame) -> pd.DataFrame:
    src = set(members[members.layer_id == f"kr-{level}@{t0}"].code)
    tgt = set(members[members.layer_id == f"kr-{level}@{t1}"].code)
    ev = events[(events.level == level) & (events.date_start > t0) & (events.date_start <= t1)]
    rec = ev[ev.type == "recode"]
    recode = dict(zip(rec.from_codes, rec.to_codes))
    nb = ev[ev.type != "recode"]
    ev_of = {}
    for r in ev.itertuples():
        for c in (r.from_codes + "|" + r.to_codes).split("|"):
            if c:
                ev_of.setdefault(c, []).append(r.event_id)
    ended = set("|".join(nb.from_codes).split("|")) - {""}
    new = tgt - src - set(recode.values())
    base = dict(level=level, from_layer=f"kr-{level}@{t0}", to_layer=f"kr-{level}@{t1}")
    rows = []
    for c in sorted(src - ended - set(recode)):
        if c not in tgt:
            raise SystemExit(f"{level} {t0}->{t1}: {c} left the layer without an event")
    for a, b in recode.items():
        rows.append({**base, "from_code": a, "to_code": b, "w_src": 1.0, "w_src_pop": 1.0, "method": "recode"})
    if nb.empty:
        for c in sorted(src - set(recode)):
            rows.append({**base, "from_code": c, "to_code": c, "w_src": 1.0, "w_src_pop": 1.0, "method": "code_1to1"})
        return pd.DataFrame(rows).assign(pop_year=None, pop_year_wanted=None)

    first = (date.fromisoformat(nb.date_start.min()) - timedelta(days=1)).strftime("%Y%m%d")
    pyear_wanted = pop_year_for(nb.date_start.min())
    pyear = pyear_wanted if (OA / f"oa_stats_{pyear_wanted}.csv").exists() else 2024
    if pyear != pyear_wanted:
        print(f"  note: {pyear_wanted} output-area statistics not available yet, using {pyear}", flush=True)
    last = nb.date_end.max().replace("-", "")
    s_poly, s_used = polygons(ended | (src & tgt), level, first, "before")
    t_poly, t_used = polygons(new | (src & tgt), level, last, "after")
    # sources to overlay: ended units, plus kept units touching a new unit
    s_poly = s_poly.reset_index(drop=True)
    t_poly = t_poly.reset_index(drop=True)
    new_geo = t_poly[t_poly.code.isin(new)]
    touching = set(gpd.sjoin(s_poly[s_poly.code.isin(src & tgt)], new_geo[["geometry"]], predicate="intersects").code) if len(new_geo) else set()
    ov_src = s_poly[s_poly.code.isin(ended | touching)]
    near_t = set(gpd.sjoin(t_poly, ov_src[["geometry"]], predicate="intersects").code) if len(ov_src) else set()
    ov_tgt = t_poly[t_poly.code.isin(near_t | new)]
    missing = sorted((ended | new) - set(s_poly.code) - set(t_poly.code))

    allocated = {}
    if len(ov_src) and len(ov_tgt):
        s = ov_src[["code", "geometry"]].rename(columns={"code": "src"}).reset_index(drop=True)
        s["src_area"] = s.area
        t = ov_tgt[["code", "geometry"]].rename(columns={"code": "tgt"}).reset_index(drop=True)
        ov = gpd.overlay(s, t, how="intersection", keep_geom_type=True)
        ov["int_m2"] = ov.area
        ov["w_area"] = ov.int_m2 / ov.src_area
        width = 2 * ov.int_m2 / ov.length
        tiny = (ov.w_area < SLIVER_SHARE) & (ov.int_m2 < SLIVER_AREA)
        only = ov.groupby("src").int_m2.transform("size") == 1
        ov = ov[~((tiny | (width < SLIVER_WIDTH)) & ~only)].copy()
        ov["w_area"] = ov.w_area / ov.groupby("src").w_area.transform("sum")
        ov["pop"] = pop_of(ov.geometry, pyear).values
        for code, g in ov.groupby("src"):
            if code in ended:
                small_new = g.tgt.isin(new) & ((level != "admdong") | (g.tgt.map(lgu_of) == lgu_of(code)))
                keep, method = g[(g.w_area >= MEANINGFUL) | small_new], "area_abolished_code"
            elif g[g.tgt.isin(new) & ((level != "admdong") | (g.tgt.map(lgu_of) == lgu_of(code)) | (g.w_area >= MEANINGFUL))].w_area.sum() >= CEDED_MIN:
                keep, method = g[(g.tgt == code) | g.tgt.isin(new)], "area_ceded_to_new"
            else:
                continue  # kept unit, nothing meaningful to a new unit: stays 1:1
            if keep.empty:
                keep = g.nlargest(1, "w_area")
            w = keep.w_area / keep.w_area.sum()
            pop = keep["pop"]
            wp = pop / pop.sum() if pop.sum() > 0 else w
            for (_, r), ws, wps in zip(keep.iterrows(), w, wp):
                rows.append({**base, "from_code": code, "to_code": r.tgt, "w_src": float(ws), "w_src_pop": float(wps),
                             "method": method, "int_m2": float(r.int_m2), "piece_pop": float(r["pop"])})
            allocated[code] = method
    # ended units with no polygon on either side: an event pair 1:1 if the event is 1:1, else unresolved
    for c in sorted(ended - set(allocated)):
        e = nb[nb.from_codes.str.split("|").map(lambda xs: c in xs)]
        to = e.to_codes.iloc[0].split("|") if len(e) else []
        if len(to) == 1:
            rows.append({**base, "from_code": c, "to_code": to[0], "w_src": 1.0, "w_src_pop": 1.0, "method": "event_1to1_no_polygon"})
        else:
            rows.append({**base, "from_code": c, "to_code": None, "w_src": 1.0, "w_src_pop": 1.0, "method": "unresolved_no_polygon"})
    for c in sorted((src & tgt) - set(allocated) - set(recode)):
        rows.append({**base, "from_code": c, "to_code": c, "w_src": 1.0, "w_src_pop": 1.0, "method": "code_1to1"})
    out = pd.DataFrame(rows)
    out["event_ids"] = [";".join(sorted(set(ev_of.get(a, []) + ev_of.get(b, [])))) for a, b in zip(out.from_code, out.to_code.fillna(""))]
    out["src_version"] = out.from_code.map(s_used)
    out["tgt_version"] = out.to_code.map(t_used)
    out["pop_year"], out["pop_year_wanted"] = pyear, pyear_wanted
    out.attrs["missing"] = missing
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--levels", nargs="*", default=["lgu", "sgg", "admdong"])
    args = ap.parse_args()
    layers = pd.read_csv(REG / "layers.csv", dtype=str)
    members = pd.read_parquet(REG / "layer_units.parquet")
    events = pd.read_csv(REG / "events.csv", dtype=str).fillna("")
    frames, notes = [], {}
    for level in args.levels:
        dates = sorted(layers[layers.level == level].reference_date)
        for t0, t1 in zip(dates[:-1], dates[1:]):
            e = window_edges(level, t0, t1, members, events)
            frames.append(e)
            if e.attrs.get("missing"):
                notes[f"{level} {t0}->{t1}"] = e.attrs["missing"]
            moved = e[e.method.str.startswith("area")]
            print(f"{level} {t0}->{t1}: {len(e)} edges, area-allocated sources {moved.from_code.nunique()}", flush=True)
    out = pd.concat(frames, ignore_index=True)
    # targets nothing flows into: units on land no earlier polygon covers (새솔동, 2018, on reclaimed
    # land of 시화호 grouped by MOIS with the 동탄면 split). Recorded, not forced: they have no past.
    no_source = []
    for level in args.levels:
        dates = sorted(layers[layers.level == level].reference_date)
        for t0, t1 in zip(dates[:-1], dates[1:]):
            got = set(out[(out.level == level) & (out.to_layer == f"kr-{level}@{t1}")].to_code)
            for c in sorted(set(members[members.layer_id == f"kr-{level}@{t1}"].code) - got):
                no_source.append({"level": level, "to_layer": f"kr-{level}@{t1}", "code": c,
                                  "reason": "no source polygon overlaps it (new land)"})
    notes_no_source = no_source
    # w_tgt: each target's share coming from each source (area of the source piece / population of the piece)
    out["int_m2"] = out.get("int_m2")
    out["piece_pop"] = out.get("piece_pop")
    for wcol, tcol, measure in (("w_src", "w_tgt", "int_m2"), ("w_src_pop", "w_tgt_pop", "piece_pop")):
        contrib = out[measure].where(out[measure].notna(), None)
        # 1:1 rows carry the whole source; a target fed only by 1:1 rows has w_tgt = 1 per source when single
        key = ["to_layer", "to_code"]
        n_src = out.groupby(key).from_code.transform("nunique")
        filled = contrib.fillna(0)
        share = filled / out.assign(_f=filled).groupby(key)._f.transform("sum")
        out[tcol] = share.where((n_src > 1) & contrib.notna(), 1.0)
        # targets mixing 1:1 and area rows (a kept unit that also receives land): 1:1 row gets the rest
        mixed = (n_src > 1) & contrib.isna()
        if mixed.any():
            rest = 1 - out.assign(_s=out[tcol].where(~mixed, 0)).groupby(key)._s.transform("sum")
            out.loc[mixed, tcol] = rest[mixed].clip(lower=0)
    out.to_parquet(REG / "crosswalk_edges.parquet", index=False)
    out[out.level.isin(["lgu", "sgg"])].to_csv(REG / "crosswalk_edges.csv", index=False, encoding="utf-8")
    meta = {"built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "admdongkor_data_version": adk.data_version(),
            "rules": {"sliver_share": SLIVER_SHARE, "sliver_area_m2": SLIVER_AREA, "sliver_width_m": SLIVER_WIDTH, "meaningful": MEANINGFUL, "ceded_min": CEDED_MIN},
            "population": "SGIS census output areas on the 2025 boundary; 2015/2020/2024 population by event year; representative points",
            "edges": int(len(out)), "by_method": out.groupby(["level", "method"]).size().unstack(fill_value=0).to_dict("index"),
            "missing_polygons": notes, "targets_without_source": notes_no_source}
    (REG / "crosswalk_edges.manifest.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps(meta["by_method"], ensure_ascii=False, indent=1))
    if notes:
        print("missing polygons:", notes)


if __name__ == "__main__":
    main()
