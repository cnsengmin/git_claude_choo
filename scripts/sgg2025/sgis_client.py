"""Minimal SGIS OpenAPI3 client. Keys and access tokens are never printed."""

from __future__ import annotations

import time

import requests

from atlas_keys import get_key, register_secret, scrub

HOST = "https://sgisapi.kostat.go.kr/OpenAPI3/"


class Sgis:
    def __init__(self, keyfile=None):
        self._ck = get_key("SGIS_CONSUMER_KEY", keyfile)
        self._cs = get_key("SGIS_CONSUMER_SECRET", keyfile)
        self._token = None
        self._issued = 0.0

    def token(self) -> str:
        # tokens live ~4h; refresh well before that
        if not self._token or time.time() - self._issued > 3000:
            r = requests.get(HOST + "auth/authentication.json",
                             params={"consumer_key": self._ck, "consumer_secret": self._cs}, timeout=30).json()
            if r.get("errCd") != 0:
                raise RuntimeError(f"SGIS auth failed: {r.get('errCd')} {r.get('errMsg')}")
            self._token = r["result"]["accessToken"]
            register_secret(self._token)
            self._issued = time.time()
        return self._token

    def get(self, path: str, **params) -> dict:
        last = None
        for attempt in range(4):
            params["accessToken"] = self.token()
            try:
                r = requests.get(HOST + path, params=params, timeout=300)
                body = r.json()
            except Exception as e:  # network / decode
                last = scrub(f"{type(e).__name__}: {e}")
                time.sleep(3 * (attempt + 1))
                continue
            if body.get("errCd") == -401:  # token expired
                self._token = None
                continue
            return body
        raise RuntimeError(f"SGIS request failed: {path} ({last})")
