"""Page through the VWorld 2D data API (GetFeature) for a box and keep every page as raw JSON.

    python scripts/vworld/harvest_data_api.py --box 124.5,33.0,131.0,38.7 --out data/raw/vworld/zoning-api-20261030 \
        LT_C_UQ111 LT_C_UQ112 LT_C_UQ113 LT_C_UQ114 LT_C_UD801

- Pages already on disk are skipped, so a run stopped by the daily limit (OVER_REQUEST_LIMIT) resumes where it stopped.
- The key comes from scripts/sgg2025/atlas_keys.py and never reaches the output, logs or receipt.
- `summary.json` in the output folder records, per dataset, the reported total, the features kept, unique feature ids
  and each page's sha256.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sgg2025"))
import atlas_keys  # noqa: E402

URL = "https://api.vworld.kr/req/data"
DOMAIN = "https://github.com/tmd8929-cyber/claude_Choo"  # the URL registered with the key


class DailyLimit(Exception):
    pass


def request(params: dict, retries: int = 4) -> dict:
    query = urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(f"{URL}?{query}", headers={"User-Agent": "atlas-kr"}), timeout=120) as r:
                response = json.loads(r.read())["response"]
        except Exception as e:  # network errors and 5xx: back off and retry
            if attempt == retries - 1:
                raise RuntimeError(atlas_keys.scrub(str(e))) from None
            time.sleep(5 * (attempt + 1))
            continue
        if response.get("status") == "ERROR":
            error = response.get("error") or {}
            if error.get("code") == "OVER_REQUEST_LIMIT":
                raise DailyLimit(error.get("text"))
            if attempt == retries - 1 or error.get("level") in ("1", "2"):
                raise RuntimeError(atlas_keys.scrub(json.dumps(error, ensure_ascii=False)))
            time.sleep(5 * (attempt + 1))
            continue
        return response
    raise RuntimeError("unreachable")


def harvest(name: str, box: str, out: Path, key: str, size: int, pause: float) -> dict:
    folder = out / name
    folder.mkdir(parents=True, exist_ok=True)
    base = {"service": "data", "request": "GetFeature", "data": name, "key": key, "geomFilter": f"BOX({box})",
            "size": size, "format": "json", "crs": "EPSG:4326", "domain": DOMAIN}
    first = request({**base, "page": 1})
    total = int(first["record"]["total"]) if first.get("status") == "OK" else 0
    pages = int(first["page"]["total"]) if total else 0
    print(f"{name}: {total:,} features, {pages} pages", flush=True)
    for page in range(1, pages + 1):
        path = folder / f"page_{page:05d}.json"
        if path.exists():
            continue
        response = first if page == 1 else request({**base, "page": page})
        features = response["result"]["featureCollection"]["features"]
        path.write_text(json.dumps({"page": page, "total": total, "features": features}, ensure_ascii=False), encoding="utf-8")
        if page % 25 == 0:
            print(f"  {name} page {page}/{pages}", flush=True)
        time.sleep(pause)

    kept, ids, files = 0, set(), []
    for path in sorted(folder.glob("page_*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        kept += len(data["features"])
        ids.update(f.get("id") for f in data["features"])
        files.append({"file": path.name, "features": len(data["features"]), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    return {"data": name, "reported_total": total, "pages": pages, "features": kept, "unique_ids": len(ids - {None}), "files": files}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("datasets", nargs="+")
    parser.add_argument("--box", required=True, help="minx,miny,maxx,maxy in EPSG:4326")
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--size", type=int, default=1000)
    parser.add_argument("--pause", type=float, default=0.3)
    parser.add_argument("--keyfile")
    args = parser.parse_args()

    key = atlas_keys.get_key("VWORLD_API_KEY", args.keyfile)
    args.out.mkdir(parents=True, exist_ok=True)
    summary_path = args.out / "summary.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8")) if summary_path.exists() else {"datasets": {}}
    summary.update({"source": "VWorld 2D 데이터 API 2.0 GetFeature", "url": URL, "box": args.box, "crs": "EPSG:4326"})
    try:
        for name in args.datasets:
            result = harvest(name, args.box, args.out, key, args.size, args.pause)
            result["harvested_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            summary["datasets"][name] = result
            summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"{name}: kept {result['features']:,} of {result['reported_total']:,}, unique ids {result['unique_ids']:,}", flush=True)
    except DailyLimit as e:
        print(f"stopped by the daily limit: {e}. Run again tomorrow to resume.", flush=True)
        sys.exit(2)


if __name__ == "__main__":
    main()
