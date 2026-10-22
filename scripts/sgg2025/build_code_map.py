#!/usr/bin/env python3
"""Build the 2025-12-31 local-government base (229 units) and an explicit
region-code map from every code system used by the collected KOSIS tables.

    python scripts/sgg2025/build_code_map.py

Inputs (all local, gitignored):
  data/raw/packages/kr-sgg-crosswalk_v0.2/boundaries/sgg_base20251231.gpkg
      252 sigungu incl. general-gu, MOIS codes (vuski/admdongkor <- SGIS)
  data/raw/sgis/boundary-2025/sgis_sgg_2025.gpkg
      252 sigungu, KOSTAT codes, from fetch_sgis_boundary.py
  data/raw/kosis/sgg2025/*.json   rows + meta from collect_kosis.py

Rules (no code slicing anywhere):
  * general-gu -> city is decided by the unit NAME ("수원시장안구" / "수원시 장안구")
    within the same sido, then confirmed by polygon containment;
  * a city's own code is looked up by (sido name, city name) in the code list
    of the same code system and vintage;
  * KOSTAT <-> MOIS sigungu pairs come from polygon overlap of the two 2025
    boundary sets (both shares >= 0.95) and must agree on name;
  * LFS (지역별고용조사) 4-digit codes are matched by name; the one duplicated
    county name (고성군) is resolved by the LFS code's own province block and
    cross-checked against registered population in validate.py.

Outputs:
  data/derived/region-codes/lgu_base_20251231.csv      229 units
  data/derived/region-codes/sgg_code_map_20251231.csv  one row per (code_system, code)
  data/raw/derived-geo/lgu_base_20251231.gpkg           dissolved geometry (EPSG:5179)
"""

from __future__ import annotations

import json
import re
from collections import defaultdict

import geopandas as gpd
import pandas as pd

from atlas_keys import REPO_ROOT

RAW = REPO_ROOT / "data" / "raw"
PKG = RAW / "packages" / "kr-sgg-crosswalk_v0.2" / "boundaries"
KOSIS_DIR = RAW / "kosis" / "sgg2025"
OUT = REPO_ROOT / "data" / "derived" / "region-codes"
GEO_OUT = RAW / "derived-geo"
RECEIPT = REPO_ROOT / "data" / "manifests" / "kosis-sgg2025-fetch.json"

CITY_GU = re.compile(r"^(.+?시)\s?(.+구)$")
SIDO_SHORT = {
    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시", "인천": "인천광역시", "광주": "광주광역시",
    "대전": "대전광역시", "울산": "울산광역시", "세종": "세종특별자치시", "경기": "경기도", "강원": "강원특별자치도",
    "충북": "충청북도", "충남": "충청남도", "전북": "전북특별자치도", "전남": "전라남도", "경북": "경상북도",
    "경남": "경상남도", "제주": "제주특별자치도",
}
SUB_OFFICE = re.compile(r"출장소$")
AGGREGATE_NAMES = {"동부", "읍부", "면부"}


def norm(s: str) -> str:
    return re.sub(r"\s+", "", str(s))


def overlap(a: gpd.GeoDataFrame, b: gpd.GeoDataFrame, ka: str, kb: str) -> pd.DataFrame:
    a = a[[ka, "geometry"]].copy()
    b = b[[kb, "geometry"]].copy()
    a["area_a"], b["area_b"] = a.area, b.area
    x = gpd.overlay(a, b, how="intersection", keep_geom_type=True)
    x["inter"] = x.area
    x["share_a"], x["share_b"] = x.inter / x.area_a, x.inter / x.area_b
    return x.drop(columns="geometry").sort_values("inter", ascending=False).drop_duplicates(ka)


def load_rows(dataset_id: str) -> list[dict]:
    return json.loads((KOSIS_DIR / f"{dataset_id}.json").read_text(encoding="utf-8"))


def load_meta(tbl: str) -> dict[str, dict]:
    meta = json.loads((KOSIS_DIR / f"meta_{tbl}.json").read_text(encoding="utf-8"))
    return {r["ITM_ID"]: r for r in meta if r["OBJ_ID"] not in ("ITEM",)}


def build_base(sgg: gpd.GeoDataFrame, mois_codes: dict[tuple[str, str], str]):
    """MOIS 252 sigungu -> 229 local governments by name, then containment check."""
    sgg = sgg.copy()
    m = sgg["name"].str.extract(CITY_GU)
    sgg["is_gu_of_city"] = m[0].notna()
    sgg["city_name"] = m[0].where(sgg.is_gu_of_city, sgg["name"])
    rows, missing = [], []
    for (sido, city), g in sgg.groupby(["sidonm", "city_name"], sort=False):
        if g.is_gu_of_city.any():
            code = mois_codes.get((sido, city))
            if code is None:
                missing.append((sido, city))
                continue
            method = "city_of_general_gu_by_name"
        else:
            assert len(g) == 1, (sido, city)
            code, method = g.code.iloc[0], "same_unit"
        rows.append({"lgu_code": code, "lgu_name": city, "sido_code": g.sidocd.iloc[0], "sido_name": sido,
                     "n_general_gu": int(g.is_gu_of_city.sum()), "member_sgg_codes": "|".join(sorted(g.code)),
                     "method": method, "geometry": g.geometry.union_all()})
    if missing:
        raise SystemExit(f"city code not found in MOIS list: {missing}")
    base = gpd.GeoDataFrame(rows, crs=sgg.crs)
    base["area_m2"] = base.area
    member = {c: r.lgu_code for r in base.itertuples() for c in r.member_sgg_codes.split("|")}
    # containment check: each sgg polygon lies (>= 99%) inside its assigned lgu polygon
    ov = overlap(sgg, base, "code", "lgu_code").set_index("code")
    bad = [(c, ov.loc[c, "lgu_code"], l) for c, l in member.items() if ov.loc[c, "lgu_code"] != l or ov.loc[c, "share_a"] < 0.99]
    if bad:
        raise SystemExit(f"containment check failed: {bad[:5]}")
    return base, member


def main() -> None:
    receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))["requests"]
    sgg = gpd.read_file(PKG / "sgg_base20251231.gpkg").astype({"code": str, "sidocd": str})
    sgis = gpd.read_file(RAW / "sgis" / "boundary-2025" / "sgis_sgg_2025.gpkg").astype({"adm_cd": str, "sido_cd": str})

    # ---- MOIS code list at 2025-12 (resident registration table) -------------------------
    mois_meta = load_meta(receipt["pop_sex"]["tbl_id"])
    mois_rows = {r["C1"]: r["C1_NM"] for r in load_rows("pop_sex")}
    mois_sido = {c: n for c, n in mois_rows.items() if mois_meta.get(c, {}).get("UP_ITM_ID") is None and c != "00"}
    mois_codes = {(mois_sido[mois_meta[c]["UP_ITM_ID"]], n): c for c, n in mois_rows.items()
                  if mois_meta.get(c, {}).get("UP_ITM_ID") in mois_sido}

    base, sgg_to_lgu = build_base(sgg, mois_codes)
    lgu_name = dict(zip(base.lgu_code, base.lgu_name))
    lgu_sido = dict(zip(base.lgu_code, base.sido_name))
    by_name = defaultdict(list)  # (sido, lgu name) -> lgu code
    for r in base.itertuples():
        by_name[(r.sido_name, r.lgu_name)].append(r.lgu_code)

    # ---- KOSTAT (SGIS 2025) <-> MOIS sigungu by polygon overlap ----------------------------
    # Coastlines, reclaimed land and islands are drawn differently in the two sets (min share
    # 0.79 for 신안군, 철원/화천 carry a known drawing error) while the runner-up share never
    # exceeds 0.15, so require: mutual best match, identical name, and both shares >= 0.75.
    ov = overlap(sgis, sgg, "adm_cd", "code")
    back = overlap(sgg, sgis, "code", "adm_cd").set_index("code")["adm_cd"]
    sgg_name = dict(zip(sgg.code, sgg.name))
    sgg_sido = dict(zip(sgg.code, sgg.sidonm))
    sgis_name = dict(zip(sgis.adm_cd, sgis.adm_nm))
    kostat_pair = {}
    for r in ov.itertuples():
        full = sgis_name[r.adm_cd]
        name_ok = norm(full) == norm(f"{sgg_sido[r.code]}{sgg_name[r.code]}")
        if min(r.share_a, r.share_b) < 0.75 or not name_ok or back[r.code] != r.adm_cd:
            raise SystemExit(f"KOSTAT {r.adm_cd} {full} -> MOIS {r.code} {sgg_name[r.code]}: "
                             f"shares {r.share_a:.3f}/{r.share_b:.3f}, name_ok={name_ok}")
        kostat_pair[r.adm_cd] = (r.code, min(r.share_a, r.share_b))
    if len(kostat_pair) != len(sgis) or len({v[0] for v in kostat_pair.values()}) != len(sgg):
        raise SystemExit("KOSTAT<->MOIS sigungu pairing is not one-to-one")

    rows: list[dict] = []

    def add(system, code, name, parent, level, lgu, method, evidence="", mois_sgg=""):
        rows.append({"code_system": system, "code": code, "name": name, "parent_name": parent, "level": level,
                     "mois_sgg_code": mois_sgg, "lgu_code": lgu or "", "lgu_name": lgu_name.get(lgu, ""),
                     "lgu_sido_name": lgu_sido.get(lgu, ""), "method": method, "evidence": evidence})

    # ---- one pass per code system over the codes that actually occur in the data -----------
    seen: dict[tuple[str, str], set[str]] = defaultdict(set)
    nonzero: set[tuple[str, str]] = set()
    for ds, rec in receipt.items():
        for r in load_rows(ds):
            seen[(rec["code_system"], r["C1"])].add(ds)
            if str(r["DT"]).strip() not in ("0", "-", ""):
                nonzero.add((rec["code_system"], r["C1"]))
    tbl_of = {ds: rec["tbl_id"] for ds, rec in receipt.items()}
    names: dict[tuple[str, str], str] = {}
    parents: dict[tuple[str, str], str | None] = {}
    for ds, rec in receipt.items():
        meta = load_meta(tbl_of[ds])
        for r in load_rows(ds):
            key = (rec["code_system"], r["C1"])
            names[key] = r["C1_NM"]
            up = meta.get(r["C1"], {}).get("UP_ITM_ID")
            parents[key] = up
            parents[(rec["code_system"], "__name__" + (up or ""))] = meta.get(up, {}).get("ITM_NM") if up else None

    def parent_name(system, code):
        up = parents.get((system, code))
        return (parents.get((system, "__name__" + up)) or "").strip() if up else None

    kostat_city_gu = defaultdict(set)  # (sido, city) -> MOIS lgu codes of its gu (from SGIS names)
    for k, (mcode, _) in kostat_pair.items():
        m = CITY_GU.match(sgis_name[k].split(" ", 1)[1])
        if m:
            kostat_city_gu[(sgis_name[k].split(" ", 1)[0], m.group(1))].add(sgg_to_lgu[mcode])

    for (system, code), used in sorted(seen.items()):
        spaced = re.sub(r"\s+", " ", names[(system, code)]).strip()  # LFS: "서울 종로구"
        name = norm(spaced)
        pname = parent_name(system, code)
        if system == "MOIS5":
            if pname is None:
                add(system, code, name, "", "national" if code == "00" else "sido", None, "aggregate_row")
            elif SUB_OFFICE.search(name):
                add(system, code, name, pname, "sub_office", None, "excluded_sub_office")
            elif code in lgu_name and lgu_sido[code] == pname and lgu_name[code] == name:
                add(system, code, name, pname, "lgu", code, "same_code_system_same_vintage", "code+name+sido")
            elif code in lgu_name and lgu_sido[code] == pname == name:
                # single-tier sido (세종): the table names the unit after the sido itself
                add(system, code, name, pname, "lgu", code, "same_code_system_same_vintage",
                    f"code+sido; single-tier unit named '{lgu_name[code]}' in base")
            elif code in sgg_to_lgu and sgg_sido[code] == pname and sgg_name[code].endswith(name):
                add(system, code, name, pname, "general_gu", sgg_to_lgu[code], "general_gu_name_then_containment",
                    f"MOIS sgg {sgg_name[code]}", mois_sgg=code)
            elif (system, code) not in nonzero:
                add(system, code, name, pname, "historic_code", None, "abolished_code_all_values_zero")
            else:
                add(system, code, name, pname, "unmatched", None, "UNMATCHED")
        elif system in ("KOSTAT5",) or len(code) == 7:
            if pname is None or name in AGGREGATE_NAMES or len(code) == 8:
                lvl = "emd" if len(code) == 8 else ("aggregate" if pname or name in AGGREGATE_NAMES else "sido")
                single = [c for (s, _), cs in by_name.items() if s == name for c in cs]
                if lvl == "sido" and len(single) == 1:
                    # single-tier sido (세종): some tables publish only the sido row.
                    # build_table.py uses it only when the table has no lgu-level row.
                    add(system, code, name, "", "sido", single[0], "single_tier_sido_row",
                        "base has exactly one unit in this sido")
                    continue
                add(system, code, name, pname or "", "national" if code == "00" else lvl, None, "aggregate_row")
                continue
            sido = pname if pname in SIDO_SHORT.values() else None
            if sido is None and name in SIDO_SHORT.values():  # 1224 광주광역시 / 1236 전라남도 under 12
                add(system, code, name, pname, "sido", None, "aggregate_row", "recoded sido block")
                continue
            sub = "KOSTAT7_2026" if len(code) == 7 else "KOSTAT5"
            if sub == "KOSTAT5" and code in kostat_pair and norm(sgis_name[code]).endswith(norm(name)):
                mcode, share = kostat_pair[code]
                lvl = "general_gu" if CITY_GU.match(sgis_name[code].split(" ", 1)[1]) else "lgu"
                add(sub, code, name, pname, lvl, sgg_to_lgu[mcode], "kostat_mois_polygon_overlap+name",
                    f"min overlap share {share:.4f}; SGIS {sgis_name[code]}", mois_sgg=mcode)
            elif sido and (sido, name) in kostat_city_gu and len(kostat_city_gu[(sido, name)]) == 1:
                lgu = next(iter(kostat_city_gu[(sido, name)]))
                add(sub, code, name, pname, "lgu", lgu, "city_of_general_gu_by_name",
                    "all SGIS general-gu of this city map to one LGU")
            elif sido and len(by_name.get((sido, name), [])) == 1:
                add(sub, code, name, pname, "lgu", by_name[(sido, name)][0], "name_match_within_sido",
                    "recoded vintage" if sub == "KOSTAT7_2026" else "")
            else:
                add(sub, code, name, pname or "", "unmatched", None, "UNMATCHED")
        elif system == "LFS4":
            name = spaced
            if " " in name:
                short, nm = name.split(" ", 1)
                cands = by_name.get((SIDO_SHORT[short], nm), [])
                how = "name_match_sido_prefix_in_name"
            else:
                cands = [c for (s, n), cs in by_name.items() if n == name for c in cs]
                how = "name_match_unique_nationwide"
                if len(cands) > 1:
                    # duplicated county name: use the province block of the LFS list itself
                    block = {c2: s for (s, n), cs in by_name.items() for c2 in cs}
                    peers = [(c, n) for (sy, c), n in names.items() if sy == "LFS4" and c[:2] == code[:2] and c != code]
                    provinces = {lgu_sido[by_name_any[0]] for _, n in peers
                                 if len(by_name_any := [c for (s, nn), cs in by_name.items() if nn == n.strip() for c in cs]) == 1}
                    cands = [c for c in cands if block[c] in provinces]
                    how = "name_match_province_block_of_lfs_list"
            if len(cands) == 1:
                add(system, code, name, "", "lgu", cands[0], how)
            else:
                add(system, code, name, "", "unmatched", None, "UNMATCHED", f"candidates {cands}")

    cmap = pd.DataFrame(rows)
    # census 읍면동 rows (8-digit) are out of scope for a sigungu map; keep only their count
    print(f"skipped {int((cmap.level == 'emd').sum())} 읍면동 rows from the census table")
    cmap = cmap[cmap.level != "emd"]
    used = {(s, c): ";".join(sorted(v)) for (s, c), v in seen.items()}
    cmap["used_by"] = [used.get((s if s != "KOSTAT7_2026" else "KOSTAT5", c), "") for s, c in zip(cmap.code_system, cmap.code)]

    OUT.mkdir(parents=True, exist_ok=True)
    GEO_OUT.mkdir(parents=True, exist_ok=True)
    base_tab = base.drop(columns="geometry").sort_values("lgu_code")
    base_tab.to_csv(OUT / "lgu_base_20251231.csv", index=False, encoding="utf-8")
    base.sort_values("lgu_code").to_file(GEO_OUT / "lgu_base_20251231.gpkg", driver="GPKG")
    cmap.to_csv(OUT / "sgg_code_map_20251231.csv", index=False, encoding="utf-8")

    print(f"LGU base: {len(base)} units "
          f"({int((base.n_general_gu > 0).sum())} cities with general-gu, {len(sgg)} sigungu in)")
    print(cmap.groupby(["code_system", "level"]).size().to_string())
    un = cmap[cmap.method == "UNMATCHED"]
    if len(un):
        print("\nUNMATCHED:\n" + un.to_string())
        raise SystemExit(1)


if __name__ == "__main__":
    main()
