#!/usr/bin/env python3
"""Attach a boundary version to every layer and check that the layer's units are
the boundary's units (design v2.1, 2-3).

    python scripts/region_registry/build_layer_boundaries.py [--detail]

Boundaries come from the admdongkor package (vuski/admdongkor; data CC BY 4.0,
from SGIS under KOGL Type 1). For each layer date the latest boundary version on
or before that date is used. Each version is cached under
data/raw/admdongkor/<version>/ (gitignored) as GeoParquet, EPSG:5179.

  admdong layer  vs  emd boundary   (MOIS 10-digit `emdcd`)
  sgg layer      vs  sgg boundary   (MOIS 5-digit `sggcd`, general-gu kept)
  lgu layer      vs  sgg boundary folded to its local government through the
                     registry's parent links (never by cutting codes)

Output: data/derived/region-registry/layer_boundaries.csv
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import admdongkor as adk
import geopandas as gpd
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
REG = REPO_ROOT / "data" / "derived" / "region-registry"
CACHE = REPO_ROOT / "data" / "raw" / "admdongkor"
DAY = timedelta(days=1)


def load(version: str, level: str, detail: bool) -> gpd.GeoDataFrame:
    p = CACHE / version / f"{level}{'_detail' if detail else ''}.parquet"
    if p.exists():
        return gpd.read_parquet(p)
    g = adk.get(version, level, detail=detail)
    for c in g.columns:
        if c != "geometry" and g[c].dtype == object:
            g[c] = g[c].astype("string")
    p.parent.mkdir(parents=True, exist_ok=True)
    g.to_parquet(p)
    return g


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--detail", action="store_true", help="full-resolution boundaries (needed for crosswalk weights)")
    args = ap.parse_args()

    layers = pd.read_csv(REG / "layers.csv", dtype=str)
    members = pd.read_parquet(REG / "layer_units.parquet")
    u = pd.read_parquet(REG / "region_units.parquet").set_index("code")
    for c in ("valid_from", "valid_to"):
        u[c] = pd.to_datetime(u[c].replace("", None)).dt.date
    versions = sorted(adk.get_list())

    # every code that ever has a polygon in the versions we use; registry units outside it have none
    # (철원 근동·원동·원남·임남면, 고성 수동면 north of the line, 파주 장단·진동·진서면 in the DMZ)
    used = {[v for v in versions if v <= d.replace("-", "")][-1] for d in layers.reference_date.unique()}
    ever_emd = set().union(*(set(load(v, "emd", args.detail).emdcd.astype(str)) for v in sorted(used)))

    events = pd.read_csv(REG / "events.csv", dtype=str).fillna("")

    def classify(codes: list[str], side: str, version: str, d: str, level: str) -> dict[str, list[str]]:
        vdate = pd.Timestamp(version).date()
        ldate = pd.Timestamp(d).date()
        win = events[(events.level == level) & (events.date_start > vdate.isoformat()) & (events.date_start <= d)]
        moved = {"layer": set("|".join(win.to_codes).split("|")), "boundary": set("|".join(win.from_codes).split("|"))}
        out = {"no_polygon": [], "source_gap": [], "version_lag": [], "unexplained": []}
        for c in codes:
            key = c if len(c) == 10 else c + "00000"
            r = u.loc[key] if key in u.index else None
            if side == "layer" and len(c) == 10 and c not in ever_emd:
                out["no_polygon"].append(c)        # never drawn by the boundary source
            elif r is not None and side == "layer" and r.valid_from > vdate:
                out["version_lag"].append(c)       # created after the boundary version
            elif r is not None and side == "boundary" and pd.notna(r.valid_to) and vdate <= r.valid_to + DAY and r.valid_to < ldate:
                out["version_lag"].append(c)       # abolished on or after the boundary version's day (통영 2010-12-31)
            elif r is not None and side == "boundary" and ldate < r.valid_from <= ldate + 3 * DAY:
                out["version_lag"].append(c)       # boundary already shows a change due a few days later (칠원읍 2015-01-01)
            elif key in moved.get(side, set()):
                out["version_lag"].append(c)       # membership changed by an event after the version (부천시 2016-07)
            elif side == "layer" and len(c) == 10 and c in ever_emd:
                out["source_gap"].append(c)        # drawn in other versions, missing from this one
            else:
                out["unexplained"].append(c)
        return out

    rows = []
    for d in sorted(layers.reference_date.unique()):
        key = d.replace("-", "")
        version = [v for v in versions if v <= key][-1]
        emd = load(version, "emd", args.detail)
        sgg = load(version, "sgg", args.detail)
        b_emd = set(emd.emdcd.astype(str))
        b_sgg = set(sgg.sggcd.astype(str))
        # sgg boundary units folded to local governments via the registry (general-gu -> its city)
        b_lgu = set()
        unknown = []
        for c5 in b_sgg:
            c10 = c5 + "00000"  # the MOIS sigungu row of the same code system
            if c10 not in u.index:
                unknown.append(c5)
                continue
            r = u.loc[c10]
            b_lgu.add(r.parent_code[:5] if r.level == "general_gu" and isinstance(r.parent_code, str) else c5)
        for level, bset in (("admdong", b_emd), ("sgg", b_sgg), ("lgu", b_lgu)):
            lid = f"kr-{level}@{d}"
            m = members[members.layer_id == lid].code
            mine = set(m) if level == "admdong" else set(m.str[:5])
            only_l, only_b = sorted(mine - bset), sorted(bset - mine)
            cl, cb = classify(only_l, "layer", version, d, level), classify(only_b, "boundary", version, d, level)
            unexplained = cl["unexplained"] + cb["unexplained"]
            lag = cl["version_lag"] + cb["version_lag"]
            status = ("match" if not only_l and not only_b else "unexplained" if unexplained
                      else "version_lag" if lag else "match_except_missing_polygons")
            rows.append({
                "n_no_polygon": len(cl["no_polygon"]), "n_source_gap": len(cl["source_gap"]), "n_version_lag": len(lag),
                "n_unexplained": len(unexplained), "no_polygon": "|".join(cl["no_polygon"]),
                "source_gap": "|".join(cl["source_gap"]), "version_lag": "|".join(lag), "unexplained": "|".join(unexplained),
                "layer_id": lid, "level": level, "reference_date": d, "boundary_version": version,
                "boundary_source": f"admdongkor {adk.data_version()}", "detail": args.detail,
                "n_layer": len(mine), "n_boundary": len(bset), "n_only_layer": len(only_l), "n_only_boundary": len(only_b),
                "status": status,
                "only_layer": "|".join(only_l), "only_boundary": "|".join(only_b),
                "unknown_boundary_codes": "|".join(sorted(unknown)) if level == "lgu" else "",
            })
        print(d, version, {r["level"]: (r["n_layer"], r["n_boundary"], r["status"]) for r in rows[-3:]})

    out = pd.DataFrame(rows)
    out.to_csv(REG / "layer_boundaries.csv", index=False, encoding="utf-8")
    meta = {"built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "admdongkor_package": adk.__version__,
            "admdongkor_data_version": adk.data_version(), "cache": CACHE.relative_to(REPO_ROOT).as_posix(),
            "detail": args.detail, "layers": len(out), "match": int((out.status == "match").sum())}
    (REG / "layer_boundaries.manifest.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(out.pivot(index="reference_date", columns="level", values="status").to_string())


if __name__ == "__main__":
    main()
