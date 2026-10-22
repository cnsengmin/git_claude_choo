#!/usr/bin/env python3
"""Fetch SGIS administrative boundaries (KOSTAT codes) for one reference year.

    python scripts/sgg2025/fetch_sgis_boundary.py --year 2025 --level sgg
    python scripts/sgg2025/fetch_sgis_boundary.py --year 2025 --level emd

Writes the raw provider GeoJSON per sido plus one merged GeoPackage
(EPSG:5179, native `adm_cd`/`adm_nm` kept as strings) under
data/raw/sgis/boundary-<year>/ (gitignored), and a receipt manifest under
data/manifests/.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd

from atlas_keys import REPO_ROOT
from sgis_client import Sgis

LOW_SEARCH = {"sgg": "1", "emd": "2"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", default="2025")
    ap.add_argument("--level", choices=sorted(LOW_SEARCH), default="sgg")
    ap.add_argument("--keyfile")
    args = ap.parse_args()

    out_dir = REPO_ROOT / "data" / "raw" / "sgis" / f"boundary-{args.year}"
    (out_dir / "geojson").mkdir(parents=True, exist_ok=True)
    api = Sgis(args.keyfile)

    sidos = api.get("addr/stage.json")["result"]
    frames, files = [], []
    for s in sidos:
        body = api.get("boundary/hadmarea.geojson", year=args.year, adm_cd=s["cd"], low_search=LOW_SEARCH[args.level])
        if body.get("errCd") != 0:
            raise SystemExit(f"{s['cd']}: {body.get('errCd')} {body.get('errMsg')}")
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        path = out_dir / "geojson" / f"{args.level}_{s['cd']}.geojson"
        path.write_bytes(raw)
        files.append({"path": path.relative_to(REPO_ROOT).as_posix(), "sido": s["cd"], "features": len(body["features"]),
                      "sha256": hashlib.sha256(raw).hexdigest()})
        g = gpd.GeoDataFrame.from_features(body["features"], crs="EPSG:5179")
        g["sido_cd"], g["sido_nm"] = s["cd"], s["addr_name"]
        frames.append(g)
        print(f"{s['cd']} {s['addr_name']}: {len(g)}")

    g = gpd.GeoDataFrame(__import__("pandas").concat(frames, ignore_index=True), crs="EPSG:5179")
    for c in ("adm_cd", "adm_nm", "sido_cd"):
        g[c] = g[c].astype(str)
    gpkg = out_dir / f"sgis_{args.level}_{args.year}.gpkg"
    g[["adm_cd", "adm_nm", "sido_cd", "sido_nm", "geometry"]].to_file(gpkg, driver="GPKG")

    manifest = {
        "schema_version": "0.1.0",
        "source_id": "sgis",
        "dataset_id": f"sgis.boundary.{args.level}",
        "reference_year": args.year,
        "acquired_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "request": {"endpoint": "OpenAPI3/boundary/hadmarea.geojson", "params": {"year": args.year, "low_search": LOW_SEARCH[args.level], "adm_cd": "<each sido>"}},
        "crs": "EPSG:5179 (UTM-K, as served)",
        "code_system": "KOSTAT/SGIS administrative code (not MOIS)",
        "storage": {"kind": "local-gitignored", "path": out_dir.relative_to(REPO_ROOT).as_posix()},
        "files": files,
        "merged": {"path": gpkg.relative_to(REPO_ROOT).as_posix(), "features": len(g)},
        "license_status": "KOGL Type 1 (공공누리 제1유형, 출처표시)",
        "redistribution_status": "attribution-required",
    }
    mpath = REPO_ROOT / "data" / "manifests" / f"sgis-boundary-{args.level}-{args.year}.json"
    mpath.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(g)} features -> {gpkg.relative_to(REPO_ROOT)}; manifest {mpath.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
