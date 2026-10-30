#!/usr/bin/env python3
"""Rebuild the nationwide sigungu crosswalk package (kr-sgg-crosswalk v0.3) from the
region registry (design v2.1, section 3; plan P6).

    python scripts/region_registry/build_sgg_package.py

Reads data/derived/region-registry/ (layers, units, events, code map, chained
crosswalks) and writes packages/kr-sgg-crosswalk/:

  crosswalk/crosswalk_{lgu,sgg}_to_base{20251231,20261001}.csv   year -> base layer
  crosswalk/events_{lgu,sgg}.csv                                  official change events
  units/{lgu,sgg}_units_by_year.csv                               units of every layer
  examples/example_synthetic_input_lgu.csv                        synthetic demo input
  manifest.json                                                   sources and file hashes

Codes: `code` is the 5-digit MOIS sigungu code (the sigungu part of the 10-digit
행정기관코드, kept as `code10`); `kostat` comes from the layer code map, never from
cutting digits. The hand-written parts (README, code/, tests/, examples/*.py|R)
live in the package folder and are not generated.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
REG = REPO_ROOT / "data" / "derived" / "region-registry"
PKG = REPO_ROOT / "packages" / "kr-sgg-crosswalk"
VERSION = "0.3.0"
BASES = ["2025-12-31", "2026-10-01"]


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def write(df: pd.DataFrame, rel: str) -> None:
    p = PKG / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(p, index=False, encoding="utf-8-sig", lineterminator="\n")  # BOM: opens in Excel


def main() -> None:
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from crosswalk_chain import measures  # area + census population per layer unit

    layers = pd.read_csv(REG / "layers.csv", dtype=str)
    members = pd.read_parquet(REG / "layer_units.parquet")
    u = pd.read_parquet(REG / "region_units.parquet").set_index("code")
    cm = pd.read_csv(REG / "code_map_layers.csv", dtype=str)
    lb = pd.read_csv(REG / "layer_boundaries.csv", dtype=str).set_index("layer_id")
    # one KOSTAT code per (layer, unit); a city with general-gu has several gu codes at the
    # lgu level and gets none (aggregate gu rows with units/sgg_units_by_year.csv instead)
    one = cm.groupby(["layer_id", "mois_code"]).kostat_final.agg(lambda s: s.iloc[0] if s.nunique() == 1 else "")
    kostat = one.to_dict()
    # a unit the layer's boundary version does not draw yet (부천시 2016-12-31: the 2016-02 version
    # still has the gu) has no row at all; it takes the code of the same unit in the nearest layer
    by_unit = {}
    for (lid, code), k in kostat.items():
        if k:
            by_unit.setdefault((lid.split("@")[0], code), []).append((lid.split("@")[1], k))

    sm = members[members.layer_id.str.startswith("kr-sgg@")]
    sgg_member = set(zip(sm.layer_id, sm.code))

    def kostat_of(lid: str, code: str) -> tuple[str, str]:
        level, d = lid.split("@")
        if level == "kr-lgu" and (f"kr-sgg@{d}", code) in sgg_member:
            return kostat_of(f"kr-sgg@{d}", code)  # no general-gu that day: the same unit as at sgg level
        if (lid, code) in kostat:
            return kostat[(lid, code)], "layer_code_map"
        near = sorted(by_unit.get((level, code), []), key=lambda x: abs(date.fromisoformat(x[0]) - date.fromisoformat(d)))
        return (near[0][1], f"nearest_layer {near[0][0]}") if near else ("", "none")

    def unit_cols(code10: pd.Series, layer_ids: pd.Series, prefix: str) -> pd.DataFrame:
        ks = [kostat_of(l, c) for l, c in zip(layer_ids, code10)]
        cols = {
            f"{prefix}code": code10.str[:5],
            f"{prefix}code10": code10,
            f"{prefix}kostat": [k for k, _ in ks],
            f"{prefix}sidonm": code10.map(u.sido_name),
            f"{prefix}name": code10.map(u["name"]),
        }
        if not prefix:  # units table: say where the KOSTAT code came from
            cols["kostat_source"] = [s for _, s in ks]
        return pd.DataFrame(cols, index=code10.index)

    files = {}
    for level in ("lgu", "sgg"):
        dates = sorted(layers[layers.level == level].reference_date)
        # ---- units by year --------------------------------------------------------------------
        rows = []
        for d in dates:
            lid = f"kr-{level}@{d}"
            codes = members[members.layer_id == lid].code.sort_values().reset_index(drop=True)
            meas = measures(level, d)
            from build_crosswalk import pop_year_for
            df = unit_cols(codes, pd.Series(lid, index=codes.index), "")
            df.insert(0, "year", int(d[:4]))
            df.insert(1, "layer_date", d)
            if level == "sgg":
                parent = codes.map(lambda c: u.loc[c].parent_code if u.loc[c].level == "general_gu" else c)
                df["lgu_code"], df["lgu_code10"] = parent.str[:5], parent
            df["boundary_version"] = lb.loc[lid, "boundary_version"]
            df["area_m2"] = codes.map(meas.area).round(1)
            df["pop_census"] = codes.map(meas["pop"]).round(0).astype("Int64")
            df["pop_year"] = pop_year_for(d)
            rows.append(df)
        units = pd.concat(rows, ignore_index=True)
        write(units, f"units/{level}_units_by_year.csv")

        # ---- crosswalks -----------------------------------------------------------------------
        for base in BASES:
            c = pd.read_csv(REG / "crosswalk" / f"{level}_to_{base.replace('-', '')}.csv", dtype={"from_code": str, "to_code": str})
            src = unit_cols(c.from_code, "kr-" + level + "@" + c.from_date, "src_")
            tgt = unit_cols(c.to_code, pd.Series(f"kr-{level}@{base}", index=c.index), "tgt_")
            whole = (c.w_src > 1 - 1e-9) & (c.w_src_pop > 1 - 1e-9)
            method = np.where(~whole, "area_split", np.where(c.from_code == c.to_code, "code_1to1", "code_changed_whole"))
            out = pd.concat([c.from_date.str[:4].astype(int).rename("year"), c.from_date.rename("layer_date"), src, tgt,
                             c[["w_src", "w_tgt", "w_src_pop", "w_tgt_pop"]].round(10), pd.Series(method, name="method")], axis=1)
            out = out.sort_values(["year", "src_code10", "tgt_code10"]).reset_index(drop=True)
            write(out, f"crosswalk/crosswalk_{level}_to_base{base.replace('-', '')}.csv")

        # ---- events -----------------------------------------------------------------------------
        ev = pd.read_csv(REG / "events.csv", dtype=str).fillna("")
        ev = ev[ev.level == level]
        five = lambda s: "|".join(x[:5] for x in s.split("|") if x)
        ev = pd.DataFrame({"event_id": ev.event_id, "date": ev.date_start, "date_end": ev.date_end, "type": ev.type,
                           "from_codes": ev.from_codes.map(five), "from_names": ev.from_names,
                           "to_codes": ev.to_codes.map(five), "to_names": ev.to_names,
                           "from_codes10": ev.from_codes, "to_codes10": ev.to_codes})
        write(ev, f"crosswalk/events_{level}.csv")

    # ---- synthetic example input (values are made up) ----------------------------------------------
    lu = pd.read_csv(PKG / "units" / "lgu_units_by_year.csv", dtype=str)
    lu = lu[lu.year.astype(int) <= 2025]
    rng = np.random.default_rng(20261023)
    ex = lu[["year", "code", "sidonm", "name"]].copy()
    ex["pop"] = rng.integers(20_000, 1_200_000, len(ex))
    ex["aged_pct"] = rng.uniform(8, 45, len(ex)).round(2)
    write(ex, "examples/example_synthetic_input_lgu.csv")

    # ---- manifest -----------------------------------------------------------------------------------
    generated = [*(PKG / "crosswalk").glob("*.csv"), *(PKG / "units").glob("*.csv"),
                 PKG / "examples" / "example_synthetic_input_lgu.csv"]
    for p in sorted(generated):
        if p.is_file():
            files[p.relative_to(PKG).as_posix()] = {"bytes": p.stat().st_size, "sha256": sha256(p)}
    reg_manifest = json.loads((REG / "manifest.json").read_text(encoding="utf-8"))
    manifest = {
        "package": "kr-sgg-crosswalk", "version": VERSION, "built": date.today().isoformat(),
        "built_from": {
            "registry": "data/derived/region-registry (scripts/region_registry/)",
            "mois_source": reg_manifest.get("source", reg_manifest.get("sources")),
            "boundaries": "vuski/admdongkor versions per layer (layer_boundaries.csv), SGIS KOGL Type 1",
            "population": "SGIS census output areas 2025 with 2015/2020/2024 census population",
        },
        "bases": BASES, "years": "2008-2025 (+2026 for the 2026-10-01 base)",
        "license": {"crosswalk": "CC BY 4.0", "code": "MIT"},
        "files": files,
    }
    (PKG / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
                                       newline="\n")  # packages/.gitattributes keeps LF
    for k, v in files.items():
        print(f"{v['bytes']:>10,}  {k}")


if __name__ == "__main__":
    main()
