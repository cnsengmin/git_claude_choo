"""Load provider API keys without ever printing them.

Lookup order for each variable:
  1. process environment
  2. `.env.local` at the repository root (gitignored)
  3. a key file outside the repository (`NAME=value` text): --keyfile, else
     ATLAS_KEYFILE from env / .env.local; its legacy names are mapped below.

Values are returned to the caller only. Use `scrub()` on any text that may be
logged (exception messages, response bodies) before printing it.
"""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# legacy key-file name -> Atlas env name
LEGACY_NAMES = {
    "KOSIS_API_KEY": "KOSIS_API_KEY",
    "SGIS_Service_ID": "SGIS_CONSUMER_KEY",
    "SGIS_API_KEY": "SGIS_CONSUMER_SECRET",
    "Vworld_API_KEY": "VWORLD_API_KEY",
    "BldRgstHub_API_KEY": "DATA_GO_KR_SERVICE_KEY",
    "RONE_API_KEY": "RONE_API_KEY",
    "SEOUL_API_KEY": "SEOUL_OPEN_API_KEY",
    "NGII_API_KEY": "NGII_API_KEY",
}

_seen: set[str] = set()


def _parse(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def default_keyfile() -> str | None:
    """ATLAS_KEYFILE: where the key file lives (env or .env.local); the keys stay outside the repo."""
    return os.environ.get("ATLAS_KEYFILE") or _parse(REPO_ROOT / ".env.local").get("ATLAS_KEYFILE")


def get_key(name: str, keyfile: str | Path | None = None) -> str:
    value = os.environ.get(name) or _parse(REPO_ROOT / ".env.local").get(name)
    keyfile = keyfile or default_keyfile()
    if not value and keyfile:
        legacy = _parse(Path(keyfile))
        value = next((v for k, v in legacy.items() if LEGACY_NAMES.get(k) == name), None)
    if not value:
        raise SystemExit(f"{name} is not configured (env, .env.local or --keyfile)")
    _seen.add(value)
    return value


def scrub(text: str) -> str:
    """Remove every key (and any extra secret registered via `register_secret`) from text."""
    for s in _seen:
        if s and len(s) >= 6:
            text = text.replace(s, "***")
    return text


def register_secret(value: str) -> None:
    if value:
        _seen.add(value)
