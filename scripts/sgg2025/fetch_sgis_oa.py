#!/usr/bin/env python3
"""Fetch SGIS census output areas (집계구) nationwide: 2025 boundaries and 2024
small-area statistics, one 읍면동 at a time.

    python scripts/sgg2025/fetch_sgis_oa.py fetch [--workers 4] [--limit N] [--only CODE ...]
    python scripts/sgg2025/fetch_sgis_oa.py merge

`fetch` saves every response verbatim to data/raw/sgis/oa-2025/{boundary,stats}/<emd>.json
(gitignored) and skips files that already exist, so an interrupted run can be
resumed. `merge` builds data/raw/sgis/oa-2025/oa_2025.gpkg (boundary + stats
joined on the output-area code, EPSG:5179) and writes the receipt
data/manifests/sgis-oa-2025.json.

The list of 읍면동 comes from data/raw/sgis/boundary-2025/sgis_emd_2025.gpkg
(fetch_sgis_boundary.py --level emd).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import geopandas as gpd
import pandas as pd

from atlas_keys import REPO_ROOT
from sgis_client import Sgis

OUT = REPO_ROOT / "data" / "raw" / "sgis" / "oa-2025"
EMD = REPO_ROOT / "data" / "raw" / "sgis" / "boundary-2025" / "sgis_emd_2025.gpkg"
MANIFEST = REPO_ROOT / "data" / "manifests" / "sgis-oa-2025.json"
BOUNDARY_YEAR, STATS_YEAR = "2025", "2024"
NO_RESULT = -100  # SGIS "검색결과가 존재하지 않습니다"


def fetch(args) -> None:
    for sub in ("boundary", "stats"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)
    codes = sorted(gpd.read_file(EMD, ignore_geometry=True).adm_cd.astype(str))
    if args.only:
        codes = [c for c in codes if c in set(args.only)]
    todo = [(c, sub) for c in codes for sub in ("boundary", "stats") if not (OUT / sub / f"{c}.json").exists()]
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(codes)} 읍면동, {len(todo)} requests to go", flush=True)

    api, lock = Sgis(args.keyfile), threading.Lock()
    api.token()  # authenticate once before the workers start
    failures: list[str] = []

    def one(code: str, sub: str) -> None:
        if sub == "boundary":
            body = api.get("boundary/statsarea.geojson", year=BOUNDARY_YEAR, adm_cd=code)
        else:
            body = api.get("stats/population.json", year=STATS_YEAR, adm_cd=code, low_search="1")
        if body.get("errCd") not in (0, NO_RESULT):
            raise RuntimeError(f"{sub} {code}: {body.get('errCd')} {body.get('errMsg')}")
        (OUT / sub / f"{code}.json").write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")

    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(one, c, s): (c, s) for c, s in todo}
        for f in as_completed(futs):
            try:
                f.result()
            except Exception as e:  # keep going; rerun picks up what is missing
                with lock:
                    failures.append(str(e))
            done += 1
            if done % 250 == 0:
                print(f"{done}/{len(todo)} done, {len(failures)} failed", flush=True)
    print(f"finished: {done} requests, {len(failures)} failed", flush=True)
    for msg in failures[:20]:
        print("  ", msg)


def merge(args) -> None:
    emd = gpd.read_file(EMD, ignore_geometry=True).astype({"adm_cd": str})
    frames, stats, empty, files = [], [], {"boundary": [], "stats": []}, []
    for code in sorted(emd.adm_cd):
        for sub in ("boundary", "stats"):
            p = OUT / sub / f"{code}.json"
            if not p.exists():
                raise SystemExit(f"missing {sub}/{code}.json — run fetch again")
            raw = p.read_bytes()
            files.append(hashlib.sha256(raw).hexdigest())
            body = json.loads(raw)
            if body.get("errCd") == NO_RESULT:
                empty[sub].append(code)
                continue
            if sub == "boundary":
                g = gpd.GeoDataFrame.from_features(body["features"], crs="EPSG:5179")
                g["emd_cd"] = code
                frames.append(g)
            else:
                s = pd.DataFrame(body["result"])
                s["emd_cd"] = code
                stats.append(s)

    b = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs="EPSG:5179")
    s = pd.concat(stats, ignore_index=True)
    b["oa_cd"] = b["adm_cd"].astype(str)
    s["oa_cd"] = s["adm_cd"].astype(str)
    stat_cols = [c for c in s.columns if c not in ("adm_cd", "adm_nm", "emd_cd", "oa_cd")]
    joined = b.merge(s[["oa_cd"] + stat_cols], on="oa_cd", how="left", validate="one_to_one")
    for c in joined.columns:
        if c != "geometry" and joined[c].dtype == object:
            joined[c] = joined[c].astype(str)
    gpkg = OUT / "oa_2025.gpkg"
    joined.to_file(gpkg, driver="GPKG")
    s.astype(str).to_csv(OUT / "oa_stats_2024.csv", index=False, encoding="utf-8")

    unmatched_b = sorted(set(b.oa_cd) - set(s.oa_cd))
    unmatched_s = sorted(set(s.oa_cd) - set(b.oa_cd))
    manifest = {
        "schema_version": "0.1.0",
        "source_id": "sgis",
        "dataset_id": "sgis.census-output-area",
        "acquired_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "requests": {
            "boundary": {"endpoint": "OpenAPI3/boundary/statsarea.geojson", "params": {"year": BOUNDARY_YEAR, "adm_cd": "<each 읍면동>"}},
            "stats": {"endpoint": "OpenAPI3/stats/population.json", "params": {"year": STATS_YEAR, "adm_cd": "<each 읍면동>", "low_search": "1"}},
        },
        "emd_count": len(emd),
        "emd_without_output_areas": empty,
        "output_areas": {"boundary": len(b), "stats": len(s), "boundary_without_stats": len(unmatched_b),
                         "stats_without_boundary": len(unmatched_s)},
        "stat_columns": stat_cols,
        "crs": "EPSG:5179 (UTM-K, as served)",
        "storage": {"kind": "local-gitignored", "path": OUT.relative_to(REPO_ROOT).as_posix(),
                    "merged": gpkg.relative_to(REPO_ROOT).as_posix()},
        "raw_files_sha256_of_sorted_hashes": hashlib.sha256("".join(files).encode()).hexdigest(),
        "license_status": "KOGL Type 1 (공공누리 제1유형, 출처표시)",
        "redistribution_status": "attribution-required",
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: manifest[k] for k in ("emd_count", "output_areas")}, ensure_ascii=False))
    print(f"empty 읍면동: boundary {len(empty['boundary'])}, stats {len(empty['stats'])}")


CHECK_PAIRS = [("tot_ppltn", "all_tot_ppltn"), ("tot_family", "all_tot_family"), ("tot_house", "all_tot_house"),
               ("corp_cnt", "all_corp_cnt")]


def check(args) -> None:
    """Sum output areas per 읍면동 and compare with the 읍면동 total each row carries (all_*).

    Output-area values are 'N/A' where SGIS suppresses small counts, so a 읍면동
    matches exactly only when none of its output areas is suppressed.
    """
    rows = []
    for p in sorted((OUT / "stats").glob("*.json")):
        body = json.loads(p.read_text(encoding="utf-8"))
        if body.get("errCd") != 0:
            continue
        for r in body["result"]:
            rows.append({**r, "emd_cd": p.stem})
    s = pd.DataFrame(rows)
    nums = lambda c: pd.to_numeric(s[c].replace("N/A", pd.NA), errors="coerce")
    report = []
    for part, total in CHECK_PAIRS:
        s[part + "_n"], s[total + "_n"] = nums(part), nums(total)
        g = s.groupby("emd_cd").agg(sum_oa=(part + "_n", "sum"), suppressed=(part + "_n", lambda x: int(x.isna().sum())),
                                    total=(total + "_n", "first"), n_total=(total + "_n", "nunique"))
        full = g[g.suppressed == 0]
        exact = int((full.sum_oa == full.total).sum())
        part_sup = g[g.suppressed > 0]
        report.append({
            "variable": part, "emd": len(g), "emd_total_consistent": bool((g.n_total <= 1).all()),
            "emd_no_suppression": len(full), "exact_match": exact,
            "max_abs_diff_no_suppression": float((full.sum_oa - full.total).abs().max()) if len(full) else 0.0,
            "emd_with_suppression": len(part_sup),
            "suppressed_never_exceeds_total": bool((part_sup.sum_oa <= part_sup.total).all()),
            "suppressed_cells": int(g.suppressed.sum()), "cells": int(s[part + "_n"].size),
        })
    out = pd.DataFrame(report)
    print(f"{s.emd_cd.nunique()} 읍면동, {len(s)} 집계구")
    print(out.to_string(index=False))
    if args.write:
        out.to_csv(OUT / "oa_check.csv", index=False, encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["fetch", "merge", "check"])
    ap.add_argument("--write", action="store_true", help="check: save oa_check.csv")
    ap.add_argument("--keyfile")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()
    {"fetch": fetch, "merge": merge, "check": check}[args.cmd](args)


if __name__ == "__main__":
    main()
