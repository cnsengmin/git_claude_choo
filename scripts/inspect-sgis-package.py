#!/usr/bin/env python3
"""Inspect SGIS download ZIP/files before spatial ingestion.

Uses only the Python standard library. It does not parse SHP geometry. Instead it
records archive members, shapefile component completeness, PRJ/CPG text, and
lightweight CSV/TXT previews. Directory inputs recursively inspect nested ZIP
packages so a large SGIS download folder can be catalogued without uploading the
raw binaries to GitHub.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from collections import Counter
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
            lines = [
                line
                for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
                if line.strip()
            ]
            return {"encoding_guess": encoding, "lines": lines[:5]}
        except UnicodeDecodeError:
            continue
    return {"encoding_guess": None, "lines": []}


def classify_package_name(name: str) -> dict:
    """Best-effort package classification from SGIS download filename only.

    This is intentionally a guess. The final dataset identity is confirmed from
    archive members/fields after inspection.
    """
    text = name.replace("_", " ").lower()
    family = "unclassified"
    spatial_level = None
    indicator = None
    reference_year = None

    year_match = re.search(r"(?:^|\D)(20\d{2})(?:\D|$)", text)
    if year_match:
        reference_year = int(year_match.group(1))
    else:
        short_year_match = re.search(r"(?:^|\D)(2[0-9])년", text)
        if short_year_match:
            reference_year = 2000 + int(short_year_match.group(1))

    if "센서스용 행정구역경계" in name:
        family = "administrative-boundary"
        if "(시도)" in name:
            spatial_level = "sido"
        elif "(시군구)" in name:
            spatial_level = "sigungu"
        elif "(읍면동)" in name:
            spatial_level = "admin-dong"
        elif "(전체)" in name:
            spatial_level = "all-admin-levels"
    elif "집계구경계" in name:
        family = "census-output-area-boundary"
    elif "기초단위구" in name:
        family = "basic-unit-boundary"
    elif "도시화지역" in name:
        family = "urbanized-area-boundary"
    elif "grid_border_grid" in name.lower() or "grid border grid" in text:
        family = "grid-boundary-partition"
    elif "격자통계" in name:
        family = "grid-statistics"
        if "인구" in name:
            indicator = "population"
        elif "사업체" in name and "종류별" in name:
            indicator = "business-by-type"
        elif "종사자" in name and "종류별" in name:
            indicator = "workers-by-type"
        elif "사업체" in name:
            indicator = "business"
        elif "종사자" in name:
            indicator = "workers"
        elif "가구" in name:
            indicator = "household"
        elif "주택" in name:
            indicator = "housing"

    for token, level in (
        ("100m", "grid-100m"),
        ("500m", "grid-500m"),
        ("1k", "grid-1km"),
        ("1km", "grid-1km"),
        ("10k", "grid-10km"),
        ("100k", "grid-100km"),
    ):
        if token in text:
            spatial_level = spatial_level or level
            break

    return {
        "family_guess": family,
        "spatial_level_guess": spatial_level,
        "indicator_guess": indicator,
        "reference_year_guess": reference_year,
        "classification_basis": "filename-only; verify from archive members and source metadata",
    }


def member_record(
    name: str,
    data: bytes | None,
    size: int,
    compressed_size: int | None = None,
    crc: int | None = None,
) -> dict:
    ext = Path(name).suffix.lower()
    record = {"name": name, "extension": ext, "size": size}
    if compressed_size is not None:
        record["compressed_size"] = compressed_size
    if crc is not None:
        record["crc32"] = f"{crc:08x}"
    if data is not None:
        record["member_sha256"] = sha256_bytes(data)
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
        out.append(
            {
                "stem": stem,
                "components": sorted(exts),
                "has_shp": ".shp" in exts,
                "has_shx": ".shx" in exts,
                "has_dbf": ".dbf" in exts,
                "has_prj": ".prj" in exts,
                "has_cpg": ".cpg" in exts,
                "minimum_complete": {".shp", ".shx", ".dbf"}.issubset(exts),
            }
        )
    return out


def inspect_zip(path: Path, *, fast: bool = False, relative_to: Path | None = None) -> dict:
    members = []
    prj_texts: dict[str, str] = {}
    cpg_texts: dict[str, str] = {}

    with zipfile.ZipFile(path, "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            ext = Path(info.filename).suffix.lower()
            data = zf.read(info) if ext in TEXT_EXTENSIONS else None
            members.append(member_record(info.filename, data, info.file_size, info.compress_size, info.CRC))
            if data is not None and ext == ".prj":
                preview = decode_preview(data, 65536)
                prj_texts[info.filename] = preview["lines"][0] if preview["lines"] else ""
            if data is not None and ext == ".cpg":
                preview = decode_preview(data, 256)
                cpg_texts[info.filename] = " ".join(preview["lines"]).strip()

    names = [m["name"] for m in members]
    display_path = path.relative_to(relative_to).as_posix() if relative_to else str(path)
    result = {
        "kind": "zip",
        "path": display_path,
        "filename": path.name,
        "size": path.stat().st_size,
        "classification": classify_package_name(path.stem),
        "members": members,
        "shapefile_groups": shapefile_groups(names),
        "prj_texts": prj_texts,
        "cpg_texts": cpg_texts,
    }
    if not fast:
        result["sha256"] = sha256_file(path)
    return result


def inspect_regular_file(path: Path, *, fast: bool = False, relative_to: Path | None = None) -> dict:
    ext = path.suffix.lower()
    data = path.read_bytes() if ext in TEXT_EXTENSIONS else None
    name = path.relative_to(relative_to).as_posix() if relative_to else path.name
    rec = member_record(name, data, path.stat().st_size)
    rec["kind"] = "file"
    rec["classification"] = classify_package_name(path.stem)
    if not fast:
        rec["sha256"] = sha256_file(path)
    return rec


def inspect_directory(path: Path, *, fast: bool = False) -> dict:
    archives = []
    files = []
    total_size = 0

    for child in sorted(p for p in path.rglob("*") if p.is_file()):
        total_size += child.stat().st_size
        try:
            if zipfile.is_zipfile(child):
                archives.append(inspect_zip(child, fast=fast, relative_to=path))
            else:
                files.append(inspect_regular_file(child, fast=fast, relative_to=path))
        except Exception as exc:
            files.append(
                {
                    "kind": "unreadable",
                    "path": child.relative_to(path).as_posix(),
                    "size": child.stat().st_size,
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )

    names = [f.get("name") or f.get("path", "") for f in files]
    family_counts = Counter(
        archive.get("classification", {}).get("family_guess", "unclassified") for archive in archives
    )
    indicator_counts = Counter(
        archive.get("classification", {}).get("indicator_guess")
        for archive in archives
        if archive.get("classification", {}).get("indicator_guess")
    )
    return {
        "kind": "directory",
        "path": str(path),
        "fast_mode": fast,
        "total_files": len(archives) + len(files),
        "archive_count": len(archives),
        "total_size": total_size,
        "classification_summary": {
            "archive_families": dict(sorted(family_counts.items())),
            "grid_stat_indicators": dict(sorted(indicator_counts.items())),
        },
        "archives": archives,
        "files": files,
        "loose_shapefile_groups": shapefile_groups(names),
    }


def inspect_path(path: Path, *, fast: bool = False) -> dict:
    if not path.exists():
        raise FileNotFoundError(path)
    if path.is_dir():
        return inspect_directory(path, fast=fast)
    if zipfile.is_zipfile(path):
        return inspect_zip(path, fast=fast)
    return inspect_regular_file(path, fast=fast)


def main() -> int:
    parser = argparse.ArgumentParser(description="Inventory SGIS raw downloads without modifying them.")
    parser.add_argument("inputs", nargs="+", help="ZIP, file, or folder containing many SGIS ZIPs")
    parser.add_argument("--out", help="Write manifest JSON to this path; stdout if omitted")
    parser.add_argument(
        "--fast",
        action="store_true",
        help="Skip full-file SHA-256 hashing. Recommended for first inventory of very large folders; hash selected packages later.",
    )
    args = parser.parse_args()

    artifacts = []
    errors = []
    for raw in args.inputs:
        path = Path(raw).expanduser().resolve()
        try:
            artifacts.append(inspect_path(path, fast=args.fast))
        except Exception as exc:
            errors.append({"input": raw, "error": f"{type(exc).__name__}: {exc}"})

    manifest = {
        "schema_version": "0.3.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "purpose": "SGIS raw package inventory before Atlas normalization",
        "fast_mode": args.fast,
        "policy": {
            "raw_files_mutated": False,
            "geometry_parsed": False,
            "codes_coerced_to_number": False,
            "filename_classification_is_authoritative": False,
            "sha256_policy": "omitted in --fast mode; compute for selected source packages before normalization",
            "next_step": "Choose the boundary/grid/statistics packages from this inventory, then inspect actual SHP fields/CRS with geospatial tooling and create dataset-specific receipts/manifests.",
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
