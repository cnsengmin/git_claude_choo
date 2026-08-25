#!/usr/bin/env python3
"""Inspect SGIS SHP/DBF metadata inside ZIP archives without extracting them.

Standard-library only. The script reads:
- SHP header CRS-independent bounding boxes and shape type
- DBF schema, row count, and optional text matches for non-grid boundary packages
- CPG/PRJ metadata
- candidate grid-boundary partitions whose archive bbox intersects a matched region

Grid archives are deliberately *not* scanned record-by-record during the region-name
lookup. Their archive-level SHP bbox is enough to shortlist candidate partitions and
keeps this inspection practical for multi-GB nationwide 100m grid packages.

This is intentionally an inspection tool, not the final geometry normalizer.
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

ENCODINGS = ("utf-8-sig", "utf-8", "cp949", "euc-kr")
SHAPE_TYPES = {
    0: "NullShape",
    1: "Point",
    3: "PolyLine",
    5: "Polygon",
    8: "MultiPoint",
    11: "PointZ",
    13: "PolyLineZ",
    15: "PolygonZ",
    18: "MultiPointZ",
    21: "PointM",
    23: "PolyLineM",
    25: "PolygonM",
    28: "MultiPointM",
    31: "MultiPatch",
}


def decode_bytes(data: bytes, preferred: str | None = None) -> tuple[str, str]:
    candidates: list[str] = []
    if preferred:
        candidates.append(preferred)
    candidates.extend(e for e in ENCODINGS if e not in candidates)
    for enc in candidates:
        try:
            return data.decode(enc), enc
        except (UnicodeDecodeError, LookupError):
            continue
    return data.decode("latin1", errors="replace"), "latin1-replace"


def normalize_cpg(raw: bytes | None) -> str | None:
    if not raw:
        return None
    text, _ = decode_bytes(raw)
    value = text.strip().replace("\ufeff", "")
    if not value:
        return None
    aliases = {
        "949": "cp949",
        "cp949": "cp949",
        "euc-kr": "euc-kr",
        "utf-8": "utf-8",
        "utf8": "utf-8",
    }
    return aliases.get(value.lower(), value)


def shp_header(data: bytes) -> dict:
    if len(data) < 100:
        raise ValueError("SHP header shorter than 100 bytes")
    file_code = struct.unpack(">i", data[0:4])[0]
    file_length_words = struct.unpack(">i", data[24:28])[0]
    version = struct.unpack("<i", data[28:32])[0]
    shape_type = struct.unpack("<i", data[32:36])[0]
    xmin, ymin, xmax, ymax = struct.unpack("<4d", data[36:68])
    return {
        "file_code": file_code,
        "file_length_bytes": file_length_words * 2,
        "version": version,
        "shape_type": shape_type,
        "shape_type_name": SHAPE_TYPES.get(shape_type, f"Unknown({shape_type})"),
        "bbox": [xmin, ymin, xmax, ymax],
    }


def shp_record_bboxes(data: bytes) -> list[list[float] | None]:
    if len(data) < 100:
        return []
    out: list[list[float] | None] = []
    offset = 100
    total = len(data)
    while offset + 8 <= total:
        _record_number, content_words = struct.unpack(">2i", data[offset : offset + 8])
        content_len = content_words * 2
        start = offset + 8
        end = start + content_len
        if end > total or content_len < 4:
            break
        content = data[start:end]
        shape_type = struct.unpack("<i", content[0:4])[0]
        bbox: list[float] | None = None
        if shape_type in (1, 11, 21) and len(content) >= 20:
            x, y = struct.unpack("<2d", content[4:20])
            bbox = [x, y, x, y]
        elif shape_type in (3, 5, 8, 13, 15, 18, 23, 25, 28, 31) and len(content) >= 36:
            bbox = list(struct.unpack("<4d", content[4:36]))
        out.append(bbox)
        offset = end
    return out


def parse_dbf_schema(data: bytes) -> dict:
    if len(data) < 32:
        raise ValueError("DBF header shorter than 32 bytes")
    record_count = struct.unpack("<I", data[4:8])[0]
    header_length = struct.unpack("<H", data[8:10])[0]
    record_length = struct.unpack("<H", data[10:12])[0]
    fields = []
    pos = 32
    while pos + 32 <= len(data) and pos < header_length:
        if data[pos] == 0x0D:
            break
        desc = data[pos : pos + 32]
        raw_name = desc[0:11].split(b"\x00", 1)[0]
        name = raw_name.decode("ascii", errors="replace").strip()
        field_type = chr(desc[11])
        length = desc[16]
        decimals = desc[17]
        fields.append({"name": name, "type": field_type, "length": length, "decimals": decimals})
        pos += 32
    return {
        "record_count": record_count,
        "header_length": header_length,
        "record_length": record_length,
        "fields": fields,
    }


def iter_dbf_records(data: bytes, schema: dict, encoding: str) -> Iterable[tuple[int, dict[str, str]]]:
    offset = schema["header_length"]
    record_length = schema["record_length"]
    fields = schema["fields"]
    for index in range(schema["record_count"]):
        start = offset + index * record_length
        end = start + record_length
        if end > len(data):
            break
        raw = data[start:end]
        if not raw or raw[0:1] == b"*":
            continue
        cursor = 1
        row: dict[str, str] = {}
        for field in fields:
            size = field["length"]
            chunk = raw[cursor : cursor + size]
            cursor += size
            text, _ = decode_bytes(chunk, encoding)
            row[field["name"]] = text.replace("\x00", "").strip()
        yield index, row


def intersects(a: list[float], b: list[float]) -> bool:
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def group_members(names: Iterable[str]) -> dict[str, dict[str, str]]:
    groups: dict[str, dict[str, str]] = {}
    for name in names:
        p = Path(name)
        ext = p.suffix.lower()
        if ext not in {".shp", ".dbf", ".prj", ".cpg", ".shx"}:
            continue
        stem = str(p.with_suffix(""))
        groups.setdefault(stem, {})[ext] = name
    return groups


def inspect_zip(path: Path, queries: list[str], match_limit: int) -> dict:
    is_grid_partition = "grid_border_grid" in path.name.lower()
    should_match_records = bool(queries) and not is_grid_partition

    with zipfile.ZipFile(path, "r") as zf:
        names = [i.filename for i in zf.infolist() if not i.is_dir()]
        groups = group_members(names)
        shp_groups = []
        matches = []
        for stem, members in sorted(groups.items()):
            item: dict = {"stem": stem, "members": members}
            cpg_raw = zf.read(members[".cpg"]) if ".cpg" in members else None
            encoding = normalize_cpg(cpg_raw) or "cp949"
            item["encoding"] = encoding
            if ".prj" in members:
                prj_text, prj_encoding = decode_bytes(zf.read(members[".prj"]))
                item["prj"] = prj_text.strip()
                item["prj_encoding"] = prj_encoding

            shp_data = None
            record_bboxes: list[list[float] | None] = []
            if ".shp" in members:
                # Reading the compressed member is still required by zipfile, but for grid
                # partitions we only parse the 100-byte archive-level header and skip all
                # feature bboxes/DBF text matching.
                shp_data = zf.read(members[".shp"])
                item["shp"] = shp_header(shp_data)
                if should_match_records:
                    record_bboxes = shp_record_bboxes(shp_data)

            if ".dbf" in members:
                dbf_data = zf.read(members[".dbf"])
                schema = parse_dbf_schema(dbf_data)
                item["dbf"] = schema
                if should_match_records:
                    lowered = [q.casefold() for q in queries]
                    for row_index, row in iter_dbf_records(dbf_data, schema, encoding):
                        haystack = " | ".join(row.values()).casefold()
                        if all(q in haystack for q in lowered):
                            bbox = record_bboxes[row_index] if row_index < len(record_bboxes) else None
                            matches.append(
                                {
                                    "zip": path.name,
                                    "stem": stem,
                                    "record_index": row_index,
                                    "bbox": bbox,
                                    "attributes": row,
                                }
                            )
                            if len(matches) >= match_limit:
                                break
            shp_groups.append(item)
        return {
            "filename": path.name,
            "size": path.stat().st_size,
            "is_grid_partition": is_grid_partition,
            "record_match_scanned": should_match_records,
            "shapefiles": shp_groups,
            "matches": matches,
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect SGIS shapefile schema and locate grid partitions.")
    parser.add_argument("root", help="Folder containing SGIS ZIP archives")
    parser.add_argument("--match", action="append", default=[], help="DBF text term; repeat to require multiple terms")
    parser.add_argument("--match-limit", type=int, default=20)
    parser.add_argument("--out", required=True, help="Output JSON manifest")
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    archives = sorted(p for p in root.rglob("*.zip") if p.is_file())
    inspected = []
    matched_features = []

    for index, path in enumerate(archives, start=1):
        print(f"[{index}/{len(archives)}] {path.name}", flush=True)
        try:
            item = inspect_zip(path, args.match, args.match_limit)
            item["path"] = path.relative_to(root).as_posix()
            inspected.append(item)
            matched_features.extend(item["matches"])
        except Exception as exc:
            inspected.append({"filename": path.name, "path": path.relative_to(root).as_posix(), "error": f"{type(exc).__name__}: {exc}"})

    candidate_grids = []
    region_bboxes = [m["bbox"] for m in matched_features if m.get("bbox")]
    if region_bboxes:
        for archive in inspected:
            name = archive.get("filename", "")
            if "grid_border_grid" not in name.lower():
                continue
            for shp in archive.get("shapefiles", []):
                bbox = shp.get("shp", {}).get("bbox")
                if bbox and any(intersects(bbox, region_bbox) for region_bbox in region_bboxes):
                    candidate_grids.append(
                        {
                            "filename": name,
                            "path": archive.get("path"),
                            "stem": shp.get("stem"),
                            "bbox": bbox,
                        }
                    )

    output = {
        "schema_version": "0.2.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "root": str(root),
        "queries": args.match,
        "archive_count": len(archives),
        "matched_features": matched_features,
        "candidate_grid_partitions": candidate_grids,
        "archives": inspected,
        "notes": [
            "DBF/SHP metadata is inspected directly inside ZIP archives; raw files are not modified.",
            "Grid archives are not record-scanned during name lookup; archive-level bboxes are used to shortlist partitions.",
            "Grid partition candidates are bbox intersections only and must be verified by actual feature-level spatial filtering before export.",
        ],
    }

    out = Path(args.out).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(out)
    print(f"archives={len(archives)} matches={len(matched_features)} grid_candidates={len(candidate_grids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
