#!/usr/bin/env python3
"""Inspect SGIS download ZIP/files before spatial ingestion.

Uses only the Python standard library. It does not parse SHP geometry. Instead it
records hashes, archive members, shapefile component completeness, PRJ/CPG text,
and lightweight CSV/TXT header previews so Atlas can decide the correct ingest
mapping without mutating the raw source.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

TEXT_EXTENSIONS = {".csv", ".txt", ".prj", ".cpg"}
SHP_COMPONENTS = {".shp", ".shx", ".dbf", ".prj", ".cpg"}
ENCODINGS = ("utf-8-sig", "cp949", "euc-kr", "utf-8")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def decode_preview(data: bytes, limit: int = 8192) -> dict:
    sample = data[:limit]
    for encoding in ENCODINGS:
        try:
            text = sample.decode(encoding)
            lines = [line for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n") if line.strip()]
            return {
                "encoding_guess": encoding,
                "lines": lines[:5],
            }
        except UnicodeDecodeError:
            continue
    return {"encoding_guess": None, "lines": []}


def member_record(name: str, data: bytes | None, size: int, compressed_size: int | None = None, crc: int | None = None) -> dict:
    ext = Path(name).suffix.lower()
    record = {
        "name": name,
        "extension": ext,
        "size": size,
    }
    if compressed_size is not None:
        record["compressed_size"] = compressed_size
    if crc is not None:
        record["crc32"] = f"{crc:08x}"
    if data is not None:
        record["sha256"] = sha256_bytes(data)
        if ext in TEXT_EXTENSIONS:
            record["preview"] = decode_preview(data)
    return record


def shapefile_groups(names: Iterable[str]) -> list[dict]:
    grouped: dict[str, set[str]] = {}
    for name in names:
        path = Path(name)
        ext = path.suffix.lower()
        if ext not in SHP_COMPONENTS:
            continue
        stem = str(path.with_suffix(""))
        grouped.setdefault(stem, set()).add(ext)

    out = []
    for stem, exts in sorted(grouped.items()):
        out.append({
            "stem": stem,
            "components": sorted(exts),
            "has_shp": ".shp" in exts,
            "has_shx": ".shx" in exts,
            "has_dbf": ".dbf" in exts,
            "has_prj": ".prj" in exts,
            "has_cpg": ".cpg" in exts,
            "minimum_complete": {".shp", ".shx", ".dbf"}.issubset(exts),
        })
    return out


def inspect_zip(path: Path) -> dict:
    members = []
    prj_texts: dict[str, str] = {}
    cpg_texts: dict[str, str] = {}

    with zipfile.ZipFile(path, "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            ext = Path(info.filename).suffix.lower()
            data = None
            if ext in TEXT_EXTENSIONS:
                data = zf.read(info)
            members.append(member_record(info.filename, data, info.file_size, info.compress_size, info.CRC))
            if data is not None and ext == ".prj":
                prj_texts[info.filename] = decode_preview(data, 65536)["lines"][0] if decode_preview(data, 65536)["lines"] else ""
            if data is not None and ext == ".cpg":
                preview = decode_preview(data, 256)
                cpg_texts[info.filename] = " ".join(preview["lines"]).strip()

    names = [m["name"] for m in members]
    return {
        "kind": "zip",
        "path": str(path),
        "filename": path.name,
        "size": path.stat().st_size,
        "sha256": sha256_file(path),
        "members": members,
        "shapefile_groups": shapefile_groups(names),
        "prj_texts": prj_texts,
        "cpg_texts": cpg_texts,
    }


def inspect_regular_file(path: Path) -> dict:
    ext = path.suffix.lower()
    data = path.read_bytes() if ext in TEXT_EXTENSIONS else None
    rec = member_record(path.name, data, path.stat().st_size)
    rec.update({
        "kind": "file",
        "path": str(path),
        "sha256": sha256_file(path),
    })
    return rec


def inspect_directory(path: Path) -> dict:
    files = []
    for child in sorted(p for p in path.rglob("*") if p.is_file()):
        relative = child.relative_to(path).as_posix()
        ext = child.suffix.lower()
        data = child.read_bytes() if ext in TEXT_EXTENSIONS else None
        rec = member_record(relative, data, child.stat().st_size)
        rec["sha256"] = sha256_file(child)
        files.append(rec)
    names = [f["name"] for f in files]
    return {
        "kind": "directory",
        "path": str(path),
        "files": files,
        "shapefile_groups": shapefile_groups(names),
    }


def inspect_path(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(path)
    if path.is_dir():
        return inspect_directory(path)
    if zipfile.is_zipfile(path):
        return inspect_zip(path)
    return inspect_regular_file(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Inventory SGIS raw downloads without modifying them.")
    parser.add_argument("inputs", nargs="+", help="ZIP, file, or extracted directory")
    parser.add_argument("--out", help="Write manifest JSON to this path; stdout if omitted")
    args = parser.parse_args()

    artifacts = []
    errors = []
    for raw in args.inputs:
        path = Path(raw).expanduser().resolve()
        try:
            artifacts.append(inspect_path(path))
        except Exception as exc:  # inventory should continue for other inputs
            errors.append({"input": raw, "error": f"{type(exc).__name__}: {exc}"})

    manifest = {
        "schema_version": "0.1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "purpose": "SGIS raw package inventory before Atlas normalization",
        "policy": {
            "raw_files_mutated": False,
            "geometry_parsed": False,
            "codes_coerced_to_number": False,
            "next_step": "Inspect actual SHP fields/CRS with GDAL/QGIS/Python geospatial tooling, then write a dataset-specific normalization manifest.",
        },
        "artifacts": artifacts,
        "errors": errors,
    }

    text = json.dumps(manifest, ensure_ascii=False, indent=2)
    if args.out:
        out_path = Path(args.out).expanduser().resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(text, encoding="utf-8")
        print(out_path)
    else:
        print(text)

    return 1 if errors and not artifacts else 0


if __name__ == "__main__":
    sys.exit(main())
