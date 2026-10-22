"""Minimal KOSIS OpenAPI client. The API key is never printed or written."""

from __future__ import annotations

import json
import time

import requests

from atlas_keys import get_key, scrub

BASE = "https://kosis.kr/openapi/"
MAX_CELLS = 40000  # KOSIS per-request cell limit


class Kosis:
    def __init__(self, keyfile=None):
        self._key = get_key("KOSIS_API_KEY", keyfile)

    def _get(self, path: str, params: dict):
        params = {**params, "apiKey": self._key, "format": "json", "jsonVD": "Y"}
        last = None
        for attempt in range(4):
            try:
                r = requests.get(BASE + path, params=params, timeout=180)
                text = r.text
            except Exception as e:
                last = scrub(f"{type(e).__name__}: {e}")
                time.sleep(3 * (attempt + 1))
                continue
            try:
                return json.loads(text)
            except ValueError:
                last = scrub(text[:300])
                time.sleep(3 * (attempt + 1))
        raise RuntimeError(f"KOSIS request failed: {path} ({last})")

    def meta(self, org: str, tbl: str, kind: str = "ITM"):
        return self._get("statisticsData.do", {"method": "getMeta", "type": kind, "orgId": org, "tblId": tbl})

    def data(self, org: str, tbl: str, prd_se: str, start: str, end: str, itm: str = "ALL", **objs) -> list[dict]:
        params = {"method": "getList", "orgId": org, "tblId": tbl, "itmId": itm, "prdSe": prd_se,
                  "startPrdDe": start, "endPrdDe": end}
        for i in range(1, 9):
            params[f"objL{i}"] = objs.get(f"objL{i}", "")
        body = self._get("Param/statisticsParameterData.do", params)
        if isinstance(body, dict):  # KOSIS returns {"err": ..., "errMsg": ...} on failure
            raise RuntimeError(f"KOSIS {tbl}: {scrub(json.dumps(body, ensure_ascii=False))[:300]}")
        return body
