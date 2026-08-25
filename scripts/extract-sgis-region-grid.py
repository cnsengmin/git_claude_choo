#!/usr/bin/env python3
"""Extract one SGIS administrative region to intersecting grid cells and join statistics.

The script works directly against the raw SGIS ZIP workspace. It is intentionally
provider-specific and keeps SGIS native identifiers intact.

Current MVP path:

    SGIS 2025 admin boundary (EPSG:5179)
      -> resolve sido/sigungu/dong by native hierarchy
      -> locate intersecting 2025 grid partition(s)
      -> spatially filter 100 m cells
      -> join 2024 grid population CSV by GRID_CD
      -> CSV + WGS84 GeoJSON + manifest

Only Python's standard library is required. EPSG:5179 -> EPSG:4326 conversion is
implemented from the published Korea 2000 / Unified CS parameters found in the
source PRJ. Raw ZIPs are never modified.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import struct
import sys
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Iterator

ENCODINGS = ("utf-8-sig", "utf-8", "cp949", "euc-kr")


@dataclass
class DbfField:
    name: str
    type: str
    length: int
    decimals: int


@dataclass
class PolygonShape:
    bbox: list[float]
    parts: list[list[tuple[float, float]]]


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
    aliases = {
        "949": "cp949",
        "cp949": "cp949",
        "euc-kr": "euc-kr",
        "utf-8": "utf-8",
        "utf8": "utf-8",
    }
    return aliases.get(value.lower(), value) if value else None


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


def parse_dbf_schema(data: bytes) -> tuple[int, int, int, list[DbfField]]:
    if len(data) < 32:
        raise ValueError("DBF header shorter than 32 bytes")
    record_count = struct.unpack("<I", data[4:8])[0]
    header_length = struct.unpack("<H", data[8:10])[0]
    record_length = struct.unpack("<H", data[10:12])[0]
    fields: list[DbfField] = []
    pos = 32
    while pos + 32 <= len(data) and pos < header_length:
        if data[pos] == 0x0D:
            break
        desc = data[pos : pos + 32]
        name = desc[0:11].split(b"\x00", 1)[0].decode("ascii", errors="replace").strip()
        fields.append(DbfField(name, chr(desc[11]), desc[16], desc[17]))
        pos += 32
    return record_count, header_length, record_length, fields


def read_dbf_rows(data: bytes, encoding: str) -> list[dict[str, str]]:
    count, header_len, record_len, fields = parse_dbf_schema(data)
    rows: list[dict[str, str]] = []
    for idx in range(count):
        start = header_len + idx * record_len
        end = start + record_len
        if end > len(data):
            break
        raw = data[start:end]
        if not raw or raw[0:1] == b"*":
            rows.append({})
            continue
        cursor = 1
        row: dict[str, str] = {}
        for field in fields:
            chunk = raw[cursor : cursor + field.length]
            cursor += field.length
            text, _ = decode_bytes(chunk, encoding)
            row[field.name] = text.replace("\x00", "").strip()
        rows.append(row)
    return rows


def shp_header(data: bytes) -> tuple[int, list[float]]:
    if len(data) < 100:
        raise ValueError("SHP header shorter than 100 bytes")
    shape_type = struct.unpack("<i", data[32:36])[0]
    bbox = list(struct.unpack("<4d", data[36:68]))
    return shape_type, bbox


def parse_polygon_content(content: bytes) -> PolygonShape | None:
    if len(content) < 44:
        return None
    shape_type = struct.unpack("<i", content[0:4])[0]
    if shape_type == 0:
        return None
    if shape_type not in (5, 15, 25):
        raise ValueError(f"Expected polygon shape, got type {shape_type}")
    bbox = list(struct.unpack("<4d", content[4:36]))
    num_parts, num_points = struct.unpack("<2i", content[36:44])
    parts_offset = 44
    points_offset = parts_offset + num_parts * 4
    if points_offset + num_points * 16 > len(content):
        raise ValueError("Polygon record is truncated")
    part_starts = list(struct.unpack(f"<{num_parts}i", content[parts_offset:points_offset])) if num_parts else []
    points = [
        struct.unpack("<2d", content[points_offset + i * 16 : points_offset + (i + 1) * 16])
        for i in range(num_points)
    ]
    rings: list[list[tuple[float, float]]] = []
    for i, start in enumerate(part_starts):
        stop = part_starts[i + 1] if i + 1 < len(part_starts) else num_points
        ring = [(float(x), float(y)) for x, y in points[start:stop]]
        if ring:
            rings.append(ring)
    return PolygonShape(bbox=bbox, parts=rings)


def read_shp_polygons(data: bytes) -> list[PolygonShape | None]:
    shape_type, _ = shp_header(data)
    if shape_type not in (5, 15, 25):
        raise ValueError(f"Expected polygon SHP, got type {shape_type}")
    out: list[PolygonShape | None] = []
    offset = 100
    while offset + 8 <= len(data):
        _, content_words = struct.unpack(">2i", data[offset : offset + 8])
        content_len = content_words * 2
        start = offset + 8
        end = start + content_len
        if end > len(data):
            break
        out.append(parse_polygon_content(data[start:end]))
        offset = end
    return out


def bbox_intersects(a: list[float], b: list[float]) -> bool:
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def point_in_polygon(point: tuple[float, float], polygon: PolygonShape) -> bool:
    x, y = point
    inside = False
    # Even-odd across all rings works for ordinary shell/hole shapefile polygons.
    for ring in polygon.parts:
        n = len(ring)
        if n < 3:
            continue
        j = n - 1
        for i in range(n):
            xi, yi = ring[i]
            xj, yj = ring[j]
            if (yi > y) != (yj > y):
                x_cross = (xj - xi) * (y - yi) / (yj - yi) + xi
                if x < x_cross:
                    inside = not inside
            j = i
    return inside


def orientation(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def on_segment(a: tuple[float, float], b: tuple[float, float], p: tuple[float, float], eps: float = 1e-9) -> bool:
    if abs(orientation(a, b, p)) > eps:
        return False
    return min(a[0], b[0]) - eps <= p[0] <= max(a[0], b[0]) + eps and min(a[1], b[1]) - eps <= p[1] <= max(a[1], b[1]) + eps


def segments_intersect(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float], d: tuple[float, float]) -> bool:
    o1 = orientation(a, b, c)
    o2 = orientation(a, b, d)
    o3 = orientation(c, d, a)
    o4 = orientation(c, d, b)
    if (o1 > 0) != (o2 > 0) and (o3 > 0) != (o4 > 0):
        return True
    return on_segment(a, b, c) or on_segment(a, b, d) or on_segment(c, d, a) or on_segment(c, d, b)


def polygon_intersects_rect(polygon: PolygonShape, rect: list[float]) -> bool:
    if not bbox_intersects(polygon.bbox, rect):
        return False
    xmin, ymin, xmax, ymax = rect
    corners = [(xmin, ymin), (xmax, ymin), (xmax, ymax), (xmin, ymax)]
    if any(point_in_polygon(c, polygon) for c in corners):
        return True
    for ring in polygon.parts:
        if any(xmin <= x <= xmax and ymin <= y <= ymax for x, y in ring):
            return True
        rect_edges = [
            (corners[0], corners[1]),
            (corners[1], corners[2]),
            (corners[2], corners[3]),
            (corners[3], corners[0]),
        ]
        for i in range(len(ring)):
            a = ring[i]
            b = ring[(i + 1) % len(ring)]
            if any(segments_intersect(a, b, c, d) for c, d in rect_edges):
                return True
    return False


def meridional_arc(phi: float, a: float, e2: float) -> float:
    e4 = e2 * e2
    e6 = e4 * e2
    a0 = 1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256
    a2 = 3 / 8 * (e2 + e4 / 4 + 15 * e6 / 128)
    a4 = 15 / 256 * (e4 + 3 * e6 / 4)
    a6 = 35 * e6 / 3072
    return a * (a0 * phi - a2 * math.sin(2 * phi) + a4 * math.sin(4 * phi) - a6 * math.sin(6 * phi))


def epsg5179_to_wgs84(x: float, y: float) -> tuple[float, float]:
    """Inverse Korea 2000 / Unified CS using GRS80 parameters."""
    a = 6378137.0
    f = 1 / 298.257222101
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    k0 = 0.9996
    lon0 = math.radians(127.5)
    lat0 = math.radians(38.0)
    false_easting = 1000000.0
    false_northing = 2000000.0

    e4 = e2 * e2
    e6 = e4 * e2
    a0 = 1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256
    m0 = meridional_arc(lat0, a, e2)
    m1 = m0 + (y - false_northing) / k0
    mu = m1 / (a * a0)
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    j1 = 3 * e1 / 2 - 27 * e1**3 / 32
    j2 = 21 * e1**2 / 16 - 55 * e1**4 / 32
    j3 = 151 * e1**3 / 96
    j4 = 1097 * e1**4 / 512
    fp = mu + j1 * math.sin(2 * mu) + j2 * math.sin(4 * mu) + j3 * math.sin(6 * mu) + j4 * math.sin(8 * mu)

    sin_fp = math.sin(fp)
    cos_fp = math.cos(fp)
    tan_fp = math.tan(fp)
    c1 = ep2 * cos_fp**2
    t1 = tan_fp**2
    n1 = a / math.sqrt(1 - e2 * sin_fp**2)
    r1 = a * (1 - e2) / (1 - e2 * sin_fp**2) ** 1.5
    d = (x - false_easting) / (n1 * k0)

    lat = fp - (n1 * tan_fp / r1) * (
        d**2 / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * ep2) * d**4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * ep2 - 3 * c1**2) * d**6 / 720
    )
    lon = lon0 + (
        d
        - (1 + 2 * t1 + c1) * d**3 / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * ep2 + 24 * t1**2) * d**5 / 120
    ) / cos_fp
    return math.degrees(lon), math.degrees(lat)


def shape_to_geojson(shape: PolygonShape) -> dict:
    rings = []
    for ring in shape.parts:
        coords = [epsg5179_to_wgs84(x, y) for x, y in ring]
        if coords and coords[0] != coords[-1]:
            coords.append(coords[0])
        rings.append([[lon, lat] for lon, lat in coords])
    return {"type": "Polygon", "coordinates": rings}


def zip_year_score(name: str, year: int) -> tuple[int, int]:
    explicit = f"{year}년" in name
    short = f"{str(year)[-2:]}년" in name
    return (2 if explicit else 1 if short else 0, -len(name))


def choose_archive(root: Path, required_text: str, year: int | None = None) -> Path:
    candidates = [p for p in root.rglob("*.zip") if required_text in p.name]
    if not candidates:
        raise FileNotFoundError(f"No ZIP containing {required_text!r}")
    if year is not None:
        candidates.sort(key=lambda p: zip_year_score(p.name, year), reverse=True)
        if zip_year_score(candidates[0].name, year)[0] == 0:
            raise FileNotFoundError(f"No {year} ZIP containing {required_text!r}")
    else:
        candidates.sort(key=lambda p: p.name)
    return candidates[0]


def read_single_shapefile_group(path: Path) -> tuple[list[dict[str, str]], list[PolygonShape | None], str, str]:
    with zipfile.ZipFile(path, "r") as zf:
        names = [i.filename for i in zf.infolist() if not i.is_dir()]
        groups = group_members(names)
        usable = [(stem, members) for stem, members in groups.items() if ".dbf" in members and ".shp" in members]
        if len(usable) != 1:
            raise ValueError(f"Expected one SHP group in {path.name}, found {len(usable)}")
        stem, members = usable[0]
        encoding = normalize_cpg(zf.read(members[".cpg"])) if ".cpg" in members else None
        encoding = encoding or "cp949"
        rows = read_dbf_rows(zf.read(members[".dbf"]), encoding)
        shapes = read_shp_polygons(zf.read(members[".shp"]))
        return rows, shapes, stem, encoding


def exact_name(value: str, target: str) -> bool:
    return " ".join(value.split()) == " ".join(target.split())


def resolve_region(root: Path, boundary_year: int, sido: str, sigungu: str, dong: str) -> dict:
    sido_zip = choose_archive(root, "센서스용 행정구역경계(시도)", boundary_year)
    sigungu_zip = choose_archive(root, "센서스용 행정구역경계(시군구)", boundary_year)
    dong_zip = choose_archive(root, "센서스용 행정구역경계(읍면동)", boundary_year)

    sido_rows, _, _, _ = read_single_shapefile_group(sido_zip)
    sido_matches = [r for r in sido_rows if exact_name(r.get("SIDO_NM", ""), sido)]
    if len(sido_matches) != 1:
        raise ValueError(f"Expected one sido match for {sido!r}, found {len(sido_matches)}")
    sido_code = sido_matches[0]["SIDO_CD"]

    sigungu_rows, _, _, _ = read_single_shapefile_group(sigungu_zip)
    sigungu_matches = [
        r for r in sigungu_rows
        if exact_name(r.get("SIGUNGU_NM", ""), sigungu) and r.get("SIGUNGU_CD", "").startswith(sido_code)
    ]
    if len(sigungu_matches) != 1:
        names = [r.get("SIGUNGU_NM") for r in sigungu_rows if r.get("SIGUNGU_CD", "").startswith(sido_code)]
        raise ValueError(f"Expected one sigungu match for {sigungu!r}, found {len(sigungu_matches)}. Available sample={names[:20]}")
    sigungu_code = sigungu_matches[0]["SIGUNGU_CD"]

    dong_rows, dong_shapes, dong_stem, encoding = read_single_shapefile_group(dong_zip)
    dong_matches = [
        (idx, row)
        for idx, row in enumerate(dong_rows)
        if exact_name(row.get("ADM_NM", ""), dong) and row.get("ADM_CD", "").startswith(sigungu_code)
    ]
    if len(dong_matches) != 1:
        same_name = [r for r in dong_rows if exact_name(r.get("ADM_NM", ""), dong)]
        raise ValueError(f"Expected one dong match for {dong!r} under {sigungu_code}, found {len(dong_matches)}; same-name codes={[r.get('ADM_CD') for r in same_name]}")
    idx, dong_row = dong_matches[0]
    if idx >= len(dong_shapes) or dong_shapes[idx] is None:
        raise ValueError("Matched dong has no polygon shape")

    return {
        "sido": {"name": sido, "code": sido_code, "zip": sido_zip.name},
        "sigungu": {"name": sigungu, "code": sigungu_code, "zip": sigungu_zip.name},
        "dong": {
            "name": dong,
            "code": dong_row["ADM_CD"],
            "base_date": dong_row.get("BASE_DATE"),
            "zip": dong_zip.name,
            "stem": dong_stem,
            "record_index": idx,
            "encoding": encoding,
            "shape": dong_shapes[idx],
        },
    }


def read_grid_partition(path: Path, grid_size: int, region_shape: PolygonShape) -> tuple[str, list[tuple[str, PolygonShape]]]:
    target_suffix = f"_{grid_size}M" if grid_size < 1000 else f"_{grid_size // 1000}K"
    with zipfile.ZipFile(path, "r") as zf:
        names = [i.filename for i in zf.infolist() if not i.is_dir()]
        groups = group_members(names)
        matches = [(stem, members) for stem, members in groups.items() if stem.upper().endswith(target_suffix.upper()) and ".dbf" in members and ".shp" in members]
        if not matches:
            return "", []
        stem, members = matches[0]
        _, overall_bbox = shp_header(zf.read(members[".shp"][:]) if False else b"")
        # Above is intentionally unreachable; ZIP members are read once below.
        shp_data = zf.read(members[".shp"])
        _, overall_bbox = shp_header(shp_data)
        if not bbox_intersects(overall_bbox, region_shape.bbox):
            return stem, []
        encoding = normalize_cpg(zf.read(members[".cpg"])) if ".cpg" in members else None
        encoding = encoding or "cp949"
        rows = read_dbf_rows(zf.read(members[".dbf"]), encoding)
        shapes = read_shp_polygons(shp_data)
        selected: list[tuple[str, PolygonShape]] = []
        for idx, row in enumerate(rows):
            if idx >= len(shapes):
                break
            shape = shapes[idx]
            grid_id = row.get("GRID_CD")
            if not grid_id or shape is None:
                continue
            if polygon_intersects_rect(region_shape, shape.bbox):
                selected.append((grid_id, shape))
        return stem, selected


def candidate_grid_archives(root: Path, grid_year: int, grid_size: int, region_bbox: list[float]) -> list[Path]:
    out: list[Path] = []
    suffix = f"_{grid_size}M" if grid_size < 1000 else f"_{grid_size // 1000}K"
    for path in sorted(root.rglob("*.zip")):
        if "grid_border_grid" not in path.name.lower():
            continue
        if str(grid_year) not in path.name:
            continue
        try:
            with zipfile.ZipFile(path, "r") as zf:
                names = [i.filename for i in zf.infolist() if not i.is_dir()]
                groups = group_members(names)
                for stem, members in groups.items():
                    if not stem.upper().endswith(suffix.upper()) or ".shp" not in members:
                        continue
                    header = zf.read(members[".shp"], pwd=None)[:100]
                    _, bbox = shp_header(header)
                    if bbox_intersects(bbox, region_bbox):
                        out.append(path)
                    break
        except Exception:
            continue
    return out


def partition_from_stem(stem: str) -> str:
    # grid_다사_100M -> 다사
    bits = stem.split("_")
    if len(bits) >= 3:
        return bits[1]
    raise ValueError(f"Cannot derive partition from {stem}")


def decode_csv_member(data: bytes) -> tuple[str, str]:
    for enc in ("cp949", "euc-kr", "utf-8-sig", "utf-8"):
        try:
            return data.decode(enc), enc
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("sgis", data, 0, min(1, len(data)), "No supported encoding")


def load_population(root: Path, stat_year: int, grid_size: int, partition: str, indicator: str, selected_ids: set[str]) -> tuple[dict[str, int], dict]:
    token = f"격자통계(인구)_{grid_size}m"
    candidates = [p for p in root.rglob("*.zip") if token.lower() in p.name.lower() and (f"{stat_year}년" in p.name or f"{str(stat_year)[-2:]}년" in p.name)]
    if not candidates:
        raise FileNotFoundError(f"Population ZIP not found for {stat_year} {grid_size}m")
    path = sorted(candidates, key=lambda p: zip_year_score(p.name, stat_year), reverse=True)[0]
    target_marker = f"_{partition}_{grid_size}M.csv".lower()
    with zipfile.ZipFile(path, "r") as zf:
        members = [i.filename for i in zf.infolist() if not i.is_dir() and i.filename.lower().endswith(".csv")]
        matches = [m for m in members if target_marker in m.lower()]
        if len(matches) != 1:
            raise ValueError(f"Expected one population CSV for partition {partition}, found {matches}")
        raw = zf.read(matches[0])
        text, encoding = decode_csv_member(raw)
        values: dict[str, int] = {}
        parsed_rows = 0
        for row in csv.reader(io.StringIO(text)):
            if len(row) < 4:
                continue
            year, grid_id, stat_cd, value = [v.strip() for v in row[:4]]
            if year != str(stat_year) or stat_cd != indicator or grid_id not in selected_ids:
                continue
            parsed_rows += 1
            try:
                values[grid_id] = int(float(value))
            except ValueError:
                continue
        return values, {
            "zip": path.name,
            "member": matches[0],
            "encoding": encoding,
            "indicator": indicator,
            "matched_rows": parsed_rows,
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract SGIS region -> grid -> statistic MVP package")
    parser.add_argument("root", help="Raw SGIS ZIP directory")
    parser.add_argument("--sido", required=True)
    parser.add_argument("--sigungu", required=True)
    parser.add_argument("--dong", required=True)
    parser.add_argument("--boundary-year", type=int, default=2025)
    parser.add_argument("--grid-year", type=int, default=2025)
    parser.add_argument("--stat-year", type=int, default=2024)
    parser.add_argument("--grid-size", type=int, default=100)
    parser.add_argument("--indicator", default="to_in_001", help="SGIS statistics code; to_in_001 = total population")
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    out_dir = Path(args.out_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    print("[1/4] resolving SGIS administrative hierarchy", flush=True)
    region = resolve_region(root, args.boundary_year, args.sido, args.sigungu, args.dong)
    region_shape: PolygonShape = region["dong"].pop("shape")
    print(f"      {region['sido']['name']} {region['sigungu']['name']} {region['dong']['name']} -> ADM_CD={region['dong']['code']}", flush=True)

    print("[2/4] locating and spatially filtering grid partitions", flush=True)
    grid_archives = candidate_grid_archives(root, args.grid_year, args.grid_size, region_shape.bbox)
    if not grid_archives:
        raise RuntimeError("No grid boundary partition intersects the selected region bbox")
    selected: dict[str, tuple[PolygonShape, str, str]] = {}
    partition_meta = []
    for path in grid_archives:
        stem, rows = read_grid_partition(path, args.grid_size, region_shape)
        if not stem:
            continue
        partition = partition_from_stem(stem)
        for grid_id, shape in rows:
            selected[grid_id] = (shape, partition, path.name)
        partition_meta.append({"partition": partition, "zip": path.name, "stem": stem, "selected_grid_count": len(rows)})
        print(f"      {partition}: {len(rows)} intersecting cells", flush=True)

    print("[3/4] joining SGIS grid statistics", flush=True)
    population: dict[str, int] = {}
    statistic_sources = []
    by_partition: dict[str, set[str]] = {}
    for grid_id, (_, partition, _) in selected.items():
        by_partition.setdefault(partition, set()).add(grid_id)
    for partition, ids in sorted(by_partition.items()):
        values, source = load_population(root, args.stat_year, args.grid_size, partition, args.indicator, ids)
        population.update(values)
        statistic_sources.append({"partition": partition, **source})
        print(f"      {partition}: {len(values)}/{len(ids)} cells have explicit {args.indicator} rows", flush=True)

    slug = f"sgis-{args.stat_year}-{args.grid_size}m-{region['dong']['code']}"
    csv_path = out_dir / f"{slug}.csv"
    geojson_path = out_dir / f"{slug}.geojson"
    manifest_path = out_dir / f"{slug}.manifest.json"

    print("[4/4] writing CSV / GeoJSON / manifest", flush=True)
    csv_fields = [
        "atlas_grid_id",
        "native_grid_id",
        "grid_size_m",
        "source_crs",
        "grid_reference_year",
        "statistics_reference_year",
        "indicator_code",
        "population_total",
        "population_status",
        "sgis_adm_cd",
        "sgis_adm_nm",
        "sgis_sigungu_cd",
        "sgis_sigungu_nm",
        "sgis_sido_cd",
        "sgis_sido_nm",
        "partition",
    ]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=csv_fields)
        writer.writeheader()
        for grid_id in sorted(selected):
            _, partition, _ = selected[grid_id]
            pop = population.get(grid_id)
            writer.writerow({
                "atlas_grid_id": f"sgis:{args.grid_size}m:{grid_id}",
                "native_grid_id": grid_id,
                "grid_size_m": args.grid_size,
                "source_crs": "EPSG:5179",
                "grid_reference_year": args.grid_year,
                "statistics_reference_year": args.stat_year,
                "indicator_code": args.indicator,
                "population_total": "" if pop is None else pop,
                "population_status": "explicit-row" if pop is not None else "no-stat-row",
                "sgis_adm_cd": region["dong"]["code"],
                "sgis_adm_nm": region["dong"]["name"],
                "sgis_sigungu_cd": region["sigungu"]["code"],
                "sgis_sigungu_nm": region["sigungu"]["name"],
                "sgis_sido_cd": region["sido"]["code"],
                "sgis_sido_nm": region["sido"]["name"],
                "partition": partition,
            })

    features = []
    for grid_id in sorted(selected):
        shape, partition, _ = selected[grid_id]
        pop = population.get(grid_id)
        features.append({
            "type": "Feature",
            "id": f"sgis:{args.grid_size}m:{grid_id}",
            "properties": {
                "native_grid_id": grid_id,
                "population_total": pop,
                "population_status": "explicit-row" if pop is not None else "no-stat-row",
                "indicator_code": args.indicator,
                "statistics_reference_year": args.stat_year,
                "grid_reference_year": args.grid_year,
                "sgis_adm_cd": region["dong"]["code"],
                "sgis_adm_nm": region["dong"]["name"],
                "partition": partition,
            },
            "geometry": shape_to_geojson(shape),
        })
    geojson_path.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False), encoding="utf-8")

    explicit_total = sum(population.values())
    manifest = {
        "schema_version": "0.1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "SGIS",
        "region": region,
        "source_crs": "EPSG:5179",
        "geojson_crs": "EPSG:4326",
        "boundary_reference_year": args.boundary_year,
        "grid_reference_year": args.grid_year,
        "statistics_reference_year": args.stat_year,
        "grid_size_m": args.grid_size,
        "indicator": {
            "code": args.indicator,
            "title": "총인구" if args.indicator == "to_in_001" else None,
        },
        "selection_rule": "include every 100m grid polygon whose geometry intersects the selected administrative-dong polygon",
        "grid_partitions": partition_meta,
        "statistic_sources": statistic_sources,
        "selected_grid_count": len(selected),
        "explicit_statistic_row_count": len(population),
        "no_stat_row_count": len(selected) - len(population),
        "sum_explicit_intersecting_grid_values": explicit_total,
        "warnings": [
            "The intersecting-grid sum is not an official administrative-dong population total because edge cells may cross the administrative boundary.",
            "Cells without a statistics row are preserved as null/no-stat-row; Atlas does not silently coerce them to zero in normalized output.",
            "SGIS native codes are preserved and are not derived from KIK codes by truncation.",
        ],
        "outputs": {
            "csv": csv_path.name,
            "geojson": geojson_path.name,
        },
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(csv_path)
    print(geojson_path)
    print(manifest_path)
    print(f"grids={len(selected)} explicit_population_rows={len(population)} explicit_sum={explicit_total}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
