#!/usr/bin/env python3
"""Collect yearly sigungu statistics from KOSIS for the 2008-2025 panel (layer stage 3a).

    python scripts/sgg_panel/collect_kosis_panel.py [--keyfile PATH] [--only ID ...] [--years 2008 2025]

Each (series, year) answer is saved verbatim to data/raw/kosis/sgg-panel/<id>_<year>.json
(gitignored). The receipt data/manifests/kosis-sgg-panel-fetch.json records the request
parameters (no key), row counts and SHA-256. Region codes stay as KOSIS returns them; the
build step resolves them per year through the crosswalk package's unit lists.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sgg2025"))
from atlas_keys import REPO_ROOT  # noqa: E402
from kosis_client import Kosis  # noqa: E402

RAW_DIR = REPO_ROOT / "data" / "raw" / "kosis" / "sgg-panel"
MANIFEST = REPO_ROOT / "data" / "manifests" / "kosis-sgg-panel-fetch.json"

# Same tables and items as the 2025 table (scripts/sgg2025/collect_kosis.py), for every year
# KOSIS has sigungu values. code_system: MOIS5 행정안전부 5자리, KOSTAT5 통계청 5자리.
SERIES = [
    dict(id="migration", tbl="DT_1B26001_A01", prd="Y", month="", itm="T10+T20+T25", objs={"objL1": "ALL"},
         code_system="MOIS5", years=(2008, 2025), items={"T10": "migr_in", "T20": "migr_out", "T25": "migr_net"}),
    dict(id="births", tbl="DT_1B81A23", prd="Y", month="", itm="T1", objs={"objL1": "ALL"},
         code_system="KOSTAT5", years=(2008, 2025), items={"T1": "births"}),
    dict(id="deaths", tbl="DT_1B82A01", prd="Y", month="", itm="T1", objs={"objL1": "ALL", "objL2": "0"},
         code_system="KOSTAT5", years=(2008, 2025), items={"T1": "deaths"}),
    dict(id="pop", tbl="DT_1B040A3", prd="M", month="12", itm="T20", objs={"objL1": "ALL"},
         code_system="MOIS5", years=(2011, 2025), items={"T20": "pop_total"}),
    dict(id="households", tbl="DT_1B040B3", prd="M", month="12", itm="T1", objs={"objL1": "ALL"},
         code_system="MOIS5", years=(2011, 2025), items={"T1": "households_rr"}),
    dict(id="census", tbl="DT_1IN1502", prd="Y", month="", itm="T100+T140+T200+T310", objs={"objL1": "ALL"},
         code_system="KOSTAT5", years=(2015, 2025),
         items={"T100": "census_pop", "T140": "census_foreigners", "T200": "census_households", "T310": "housing_total"}),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keyfile")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--years", nargs=2, type=int)
    args = ap.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    api = Kosis(args.keyfile)
    receipt = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    receipt.setdefault("requests", {})
    for series in SERIES:
        if args.only and series["id"] not in args.only:
            continue
        first, last = series["years"]
        if args.years:
            first, last = max(first, args.years[0]), min(last, args.years[1])
        for year in range(first, last + 1):
            period = f"{year}{series['month']}"
            rows = api.data("101", series["tbl"], series["prd"], period, period, series["itm"], **series["objs"])
            raw = json.dumps(rows, ensure_ascii=False, indent=0).encode("utf-8")
            path = RAW_DIR / f"{series['id']}_{year}.json"
            path.write_bytes(raw)
            receipt["requests"][f"{series['id']}_{year}"] = {
                "series": series["id"], "year": year, "org_id": "101", "tbl_id": series["tbl"],
                "prd_se": series["prd"], "period": period, "itm_id": series["itm"], "objs": series["objs"],
                "code_system": series["code_system"], "rows": len(rows),
                "periods_returned": sorted({r.get("PRD_DE") for r in rows}),
                "path": path.relative_to(REPO_ROOT).as_posix(), "sha256": hashlib.sha256(raw).hexdigest(),
                "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }
            print(f"{series['id']:<11} {year} {series['tbl']:<15} {len(rows):>6} rows", flush=True)
    receipt.update(schema_version="0.1.0", source_id="kosis", endpoint="openapi/Param/statisticsParameterData.do",
                   series={s["id"]: {k: s[k] for k in ("tbl", "prd", "month", "itm", "objs", "code_system", "years", "items")}
                           for s in SERIES},
                   storage={"kind": "local-gitignored", "path": RAW_DIR.relative_to(REPO_ROOT).as_posix()})
    receipt["requests"] = dict(sorted(receipt["requests"].items()))
    MANIFEST.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
