#!/usr/bin/env python3
"""Collect the most recent single-year sigungu statistics from KOSIS.

    python scripts/sgg2025/collect_kosis.py [--keyfile PATH] [--only ID ...]

Each request in REQUESTS is saved verbatim (KOSIS JSON rows) to
data/raw/kosis/sgg2025/<id>.json (gitignored). A receipt with the exact request
parameters (no key), row counts and SHA-256 goes to
data/manifests/kosis-sgg2025-fetch.json.

Region codes differ by table (see `code_system`); they are kept as returned
and resolved later through the explicit code map, never by string slicing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone

from atlas_keys import REPO_ROOT
from kosis_client import Kosis

RAW_DIR = REPO_ROOT / "data" / "raw" / "kosis" / "sgg2025"
MANIFEST = REPO_ROOT / "data" / "manifests" / "kosis-sgg2025-fetch.json"

# code_system: MOIS5 = 행정안전부 시군구 5자리, KOSTAT5 = 통계청 시군구 5자리,
#              LFS4 = 지역별고용조사 4자리 행정구역 코드
REQUESTS = [
    # 주민등록인구 (행정안전부), 2025-12 말
    dict(id="pop_sex", tbl="DT_1B040A3", prd="M", period="202512", itm="T20+T21+T22", objs={"objL1": "ALL"}, code_system="MOIS5"),
    *[dict(id=f"pop_age1_{t}", tbl="DT_1B04006", prd="M", period="202512", itm=t, objs={"objL1": "ALL", "objL2": "ALL"},
           code_system="MOIS5") for t in ("T2", "T3", "T4")],
    dict(id="households", tbl="DT_1B040B3", prd="M", period="202512", itm="T1", objs={"objL1": "ALL"}, code_system="MOIS5"),
    # 국내인구이동 (통계청, 행정안전부 코드), 2025년
    dict(id="migration", tbl="DT_1B26001_A01", prd="Y", period="2025", itm="T10+T20+T25", objs={"objL1": "ALL"}, code_system="MOIS5"),
    # 인구동향 (통계청), 2025년
    dict(id="births", tbl="DT_1B81A23", prd="Y", period="2025", itm="T1+T2", objs={"objL1": "ALL"}, code_system="KOSTAT5"),
    dict(id="deaths", tbl="DT_1B82A01", prd="Y", period="2025", itm="T1", objs={"objL1": "ALL", "objL2": "0"}, code_system="KOSTAT5"),
    # 전국사업체조사 기반 등록기반 지표 (통계청 e-지방지표), 2024년
    dict(id="establishments", tbl="DT_1YL20832", prd="Y", period="2024", itm="ALL", objs={"objL1": "ALL"}, code_system="KOSTAT5"),
    dict(id="employees", tbl="DT_1YL15014", prd="Y", period="2024", itm="ALL", objs={"objL1": "ALL"}, code_system="KOSTAT5"),
    dict(id="employees_mfg", tbl="DT_1YL5802", prd="Y", period="2024", itm="ALL", objs={"objL1": "ALL"}, code_system="KOSTAT5"),
    dict(id="employees_retail", tbl="DT_1YL6202", prd="Y", period="2024", itm="ALL", objs={"objL1": "ALL"}, code_system="KOSTAT5"),
    # 지역별고용조사 (통계청), 2025년 하반기(10월 기준)
    dict(id="lfs_summary", tbl="DT_1ES3A01S", prd="H", period="202502", itm="ALL", objs={"objL1": "ALL"}, code_system="LFS4"),
    dict(id="lfs_emp_age", tbl="DT_1ES3A03_A01S", prd="H", period="202502", itm="ALL", objs={"objL1": "ALL", "objL2": "ALL"}, code_system="LFS4"),
    # 인구주택총조사 등록센서스 (통계청), 2025-11-01 기준
    *[dict(id=f"census_{t}", tbl="DT_1IN1502", prd="Y", period="2025", itm=t, objs={"objL1": "ALL"}, code_system="KOSTAT5")
      for t in ("T100", "T110", "T120", "T140", "T200", "T210", "T310", "T311", "T312", "T313", "T314", "T315", "T320")],
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keyfile")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    api = Kosis(args.keyfile)
    receipt = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {"requests": {}}
    for req in REQUESTS:
        if args.only and req["id"] not in args.only:
            continue
        rows = api.data("101", req["tbl"], req["prd"], req["period"], req["period"], req["itm"], **req["objs"])
        raw = json.dumps(rows, ensure_ascii=False, indent=0).encode("utf-8")
        path = RAW_DIR / f"{req['id']}.json"
        path.write_bytes(raw)
        periods = sorted({r.get("PRD_DE") for r in rows})
        receipt["requests"][req["id"]] = {
            "org_id": "101", "tbl_id": req["tbl"], "tbl_nm": rows[0].get("TBL_NM") if rows else None,
            "prd_se": req["prd"], "period": req["period"], "itm_id": req["itm"], "objs": req["objs"],
            "code_system": req["code_system"], "rows": len(rows), "periods_returned": periods,
            "path": path.relative_to(REPO_ROOT).as_posix(), "sha256": hashlib.sha256(raw).hexdigest(),
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        print(f"{req['id']:<22} {req['tbl']:<16} {len(rows):>6} rows  {periods}")
    # classification metadata (parent codes) for every table, used by build_code_map.py
    for tbl in sorted({r["tbl"] for r in REQUESTS}):
        meta = api.meta("101", tbl, "ITM")
        raw = json.dumps(meta, ensure_ascii=False, indent=0).encode("utf-8")
        path = RAW_DIR / f"meta_{tbl}.json"
        path.write_bytes(raw)
        receipt.setdefault("meta", {})[tbl] = {"path": path.relative_to(REPO_ROOT).as_posix(), "rows": len(meta),
                                               "sha256": hashlib.sha256(raw).hexdigest()}
    receipt.update(schema_version="0.1.0", source_id="kosis", endpoint="openapi/Param/statisticsParameterData.do",
                   storage={"kind": "local-gitignored", "path": RAW_DIR.relative_to(REPO_ROOT).as_posix()})
    MANIFEST.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
