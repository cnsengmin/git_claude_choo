#!/usr/bin/env python3
"""Build the administrative-unit registry and the dated layers from the MOIS
code file that includes abolished codes (`jscodeYYYYMMDD(말소코드포함).zip`).

    python scripts/region_registry/build_registry.py [--snapshot DIR]

Input (gitignored): data/raw/mois/jscode<date>/x/KIKcd_H.<date>(말소코드포함)
  fixed-width CP949 text with a header line; layout as docs/MOIS_KIK_20260720.md.

Outputs (data/derived/region-registry/):
  region_units.csv / .parquet   one row per MOIS code: level, names, parent, validity
  layers.csv                    one row per (level, reference date): unit count
  layer_units.parquet           layer membership (layer_id, code)

Rules
  * level: the KIK code's own position in the MOIS hierarchy says sido /
    sigungu-row / 읍면동-row; within a sigungu row the NAME decides between a
    local government (lgu), a general-gu of a city ("수원시 장안구") and a
    sub-office ("…출장소"); the single-tier 세종 row has an empty sigungu name.
  * parent: found by NAME among rows of the same sido alive on the child's
    first day (a general-gu's city; an 읍면동's sigungu), never by cutting the
    code. Whether the code-prefix parent agrees is kept as a check column.
  * validity: valid_from = 생성일자, valid_to = 말소일자 - 1 day (a code is not in
    force on its 말소일자); open-ended rows have no valid_to.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW = REPO_ROOT / "data" / "raw" / "mois"
OUT = REPO_ROOT / "data" / "derived" / "region-registry"

CITY_GU = re.compile(r"^(.+?시)\s?(.+구)$")
OFFICE = "출장소"
LAYER_DATES = [date(y, 12, 31) for y in range(2008, 2026)] + [date(2026, 10, 1)]
LAYER_LEVELS = {  # layer level -> registry levels it holds
    "lgu": ["lgu"],                       # 기초자치단체 + 제주 행정시 + 세종
    "sgg": ["lgu_without_gu", "general_gu"],  # 일반구 구분 시군구 (computed below)
    "admdong": ["admin_dong"],
}


def ymd(s: str) -> date | None:
    s = s.strip()
    return datetime.strptime(s, "%Y%m%d").date() if s else None


def read_kik_h(path: Path) -> pd.DataFrame:
    rows = []
    for line in path.read_bytes().split(b"\n")[1:]:
        if not line.strip():
            continue
        f = lambda a, b: line[a:b].decode("cp949").strip()
        rows.append({"code": f(0, 10), "sido_name": f(11, 41), "sgg_name": f(42, 72), "emd_name": f(73, 103),
                     "born_raw": f(104, 112), "died_raw": f(113, 121)})
    df = pd.DataFrame(rows)
    if not df.code.str.fullmatch(r"\d{10}").all():
        raise SystemExit("unexpected code values; check the fixed-width layout")
    return df


def classify(r) -> str:
    position = "sido" if r.code[2:] == "00000000" else "sigungu" if r.code[5:] == "00000" else "emd"
    if position == "sido":
        return "sub_office" if OFFICE in r.sido_name else "sido"
    if position == "sigungu":
        if OFFICE in r.sgg_name or OFFICE in r.sido_name:
            return "sub_office"
        if r.sgg_name == "":
            return "lgu" if r.sido_name.endswith("특별자치시") else "unknown"
        return "general_gu" if CITY_GU.match(r.sgg_name) else "lgu"
    return "dong_sub_office" if OFFICE in r.emd_name else "admin_dong"


def alive_on(df: pd.DataFrame, d: date) -> pd.Series:
    return (df.valid_from <= d) & (df.valid_to.isna() | (df.valid_to >= d))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", help="folder holding KIKcd_H.<date>(말소코드포함); default: newest under data/raw/mois")
    args = ap.parse_args()
    snap = Path(args.snapshot) if args.snapshot else sorted(RAW.glob("jscode*/x"))[-1]
    src = next(snap.glob("KIKcd_H.*(말소코드포함)"))
    snapshot_date = re.search(r"KIKcd_H\.(\d{8})", src.name).group(1)

    df = read_kik_h(src)
    df["valid_from"] = df.born_raw.map(ymd)
    df["valid_to"] = df.died_raw.map(lambda s: ymd(s) - timedelta(days=1) if s else None)
    if (df.valid_to.notna() & (df.valid_to < df.valid_from)).any():
        bad = df[df.valid_to.notna() & (df.valid_to < df.valid_from)]
        print(f"note: {len(bad)} codes abolished on their creation day (kept, empty validity)")
    df["level"] = df.apply(classify, axis=1)
    df["name"] = [r.emd_name or r.sgg_name or r.sido_name for r in df.itertuples()]
    df["city_name"] = df.sgg_name.str.extract(CITY_GU)[0]
    # MOIS writes the same sigungu with and without a space ("부천시 소사구" / "부천시소사구")
    df["sgg_key"] = df.sgg_name.str.replace(r"\s+", "", regex=True)

    # ---- parents by name and validity ---------------------------------------------------------
    overlap_only: set[str] = set()

    def find_parent(candidates: pd.DataFrame, on: date, child: str = "", until: date | None = None) -> str | None:
        hit = candidates[(candidates.valid_from <= on) & (candidates.valid_to.isna() | (candidates.valid_to >= on))]
        if len(hit) == 1:
            return hit.code.iloc[0]
        # MOIS dates are sometimes off by weeks (광주 남구 동 1995-01-01 vs 남구 1995-03-01):
        # accept the single same-name parent whose validity overlaps the child's, and say so
        end = until or date(9999, 12, 31)
        hit = candidates[(candidates.valid_from <= end) & (candidates.valid_to.isna() | (candidates.valid_to >= on))]
        if len(hit) == 1 and child:
            overlap_only.add(child)
            return hit.code.iloc[0]
        return None

    sido_rows = df[df.level == "sido"]
    sgg_rows = df[df.level.isin(["lgu", "general_gu"])]
    lgu_rows = df[df.level == "lgu"]
    parents, methods = [], []
    for r in df.itertuples():
        on = r.valid_from
        if r.level in ("sido",):
            parents.append(None); methods.append("")
        elif r.level == "general_gu":
            parents.append(find_parent(lgu_rows[(lgu_rows.sido_name == r.sido_name) & (lgu_rows.sgg_name == r.city_name)], on))
            methods.append("city_by_name")
        elif r.level in ("lgu", "sub_office") and r.code[5:] == "00000" and r.code[2:] != "00000000":
            parents.append(find_parent(sido_rows[sido_rows.sido_name == r.sido_name], on)); methods.append("sido_by_name")
        elif r.level in ("admin_dong", "dong_sub_office"):
            cands = (sgg_rows[(sgg_rows.sido_name == r.sido_name) & (sgg_rows.sgg_key == r.sgg_key)] if r.sgg_name
                     else lgu_rows[(lgu_rows.sido_name == r.sido_name) & (lgu_rows.sgg_name == "")])
            parents.append(find_parent(cands, on, r.code, r.valid_to))
            methods.append("sigungu_by_name")
        else:
            parents.append(None); methods.append("")
    df["parent_code"], df["parent_method"] = parents, methods
    df.loc[df.code.isin(overlap_only), "parent_method"] += "_validity_overlap"
    # check only: does the MOIS code-prefix parent agree with the name-based one?
    prefix = {"admin_dong": 5, "dong_sub_office": 5, "general_gu": 4, "lgu": 2, "sub_office": 2}
    df["prefix_parent_agrees"] = [
        (isinstance(p, str) and p[:prefix[l]] == c[:prefix[l]]) if l in prefix and m else None
        for c, l, p, m in zip(df.code, df.level, df.parent_code, df.parent_method)]

    # ---- the city a general-gu belongs to is the sgg layer's parent; lgu with gu are not sgg units -------
    gu_parent = df[df.level == "general_gu"][["parent_code", "valid_from", "valid_to"]]

    def has_gu_on(code: str, d: date) -> bool:
        g = gu_parent[gu_parent.parent_code == code]
        return bool(alive_on(g, d).any())

    df["code5"] = df.code.str[:5]  # display key of the same MOIS code (시군구코드 field of KIK), not a conversion
    units = df[["code", "code5", "level", "name", "sido_name", "sgg_name", "emd_name", "parent_code", "parent_method",
                "prefix_parent_agrees", "valid_from", "valid_to", "born_raw", "died_raw"]].copy()
    units["source_snapshot"] = snapshot_date

    # ---- layers ----------------------------------------------------------------------------------
    layer_rows, members = [], []
    for d in LAYER_DATES:
        alive = df[alive_on(df, d)]
        sets = {
            "lgu": alive[alive.level == "lgu"].code,
            "sgg": alive[(alive.level == "general_gu") |
                         ((alive.level == "lgu") & ~alive.code.map(lambda c: has_gu_on(c, d)))].code,
            "admdong": alive[alive.level == "admin_dong"].code,
        }
        for lvl, codes in sets.items():
            lid = f"kr-{lvl}@{d.isoformat()}"
            layer_rows.append({"layer_id": lid, "level": lvl, "reference_date": d.isoformat(), "unit_count": len(codes),
                               "sub_offices_alive": int((alive.level.isin(["sub_office", "dong_sub_office"])).sum())
                               if lvl != "lgu" else int((alive.level == "sub_office").sum()),
                               "source_snapshot": snapshot_date})
            members += [{"layer_id": lid, "code": c} for c in sorted(codes)]

    OUT.mkdir(parents=True, exist_ok=True)
    units = units.sort_values(["code", "valid_from"])
    for c in ("valid_from", "valid_to"):
        units[c] = units[c].map(lambda v: v.isoformat() if v else "")
    units.to_csv(OUT / "region_units.csv", index=False, encoding="utf-8")
    units.astype({"prefix_parent_agrees": "boolean"}).to_parquet(OUT / "region_units.parquet", index=False)
    layers = pd.DataFrame(layer_rows)
    layers.to_csv(OUT / "layers.csv", index=False, encoding="utf-8")
    pd.DataFrame(members).to_parquet(OUT / "layer_units.parquet", index=False)

    manifest = {
        "schema_version": "0.1.0",
        "dataset_id": "atlas-region-registry",
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": {"file": src.name, "snapshot_date": snapshot_date,
                   "sha256": hashlib.sha256(src.read_bytes()).hexdigest(),
                   "receipt": f"data/manifests/mois-kik-with-abolished-{snapshot_date}.json"},
        "rows": len(units),
        "levels": units.level.value_counts().to_dict(),
        "layers": len(layers),
        "outputs": ["region_units.csv", "region_units.parquet", "layers.csv", "layer_units.parquet"],
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: manifest[k] for k in ("rows", "levels", "layers")}, ensure_ascii=False))
    print(layers.pivot(index="reference_date", columns="level", values="unit_count").to_string())


if __name__ == "__main__":
    main()
