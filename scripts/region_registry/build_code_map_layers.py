#!/usr/bin/env python3
"""KOSTAT <-> MOIS code map for every layer, checked against the official
linkage file (design v2.1, 2-5).

    python scripts/region_registry/build_code_map_layers.py [--linkage CSV]

Source of the pairs: each 읍면동 polygon of a layer's boundary version
(admdongkor, from SGIS) carries both the KOSTAT code (`emd7` until 2021,
`emd8` from 2022) and the MOIS 10-digit code (`emdcd`). One polygon = one pair;
nothing is converted by cutting one system's code into the other's.
  admdong: KOSTAT 7/8-digit 읍면동  <-> MOIS 10-digit 행정동
  sgg:     KOSTAT 시군구(the 읍면동 code's own sigungu part, within KOSTAT)
           <-> MOIS sigungu of the same polygons; must be one-to-one
  lgu:     the sgg pairs folded to local governments through the registry
Every pair records how many polygons agree on it.

Check: the official 국가데이터처 법정동 연계정보 (행정구역분류코드 8자리 +
행정기관코드 10자리, `개정일자`) is compared with the layer of the same date.

Output: data/derived/region-registry/code_map_layers.csv (sgg, lgu),
        code_map_layers_admdong.parquet, code_map_linkage_check.csv
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
REG = REPO_ROOT / "data" / "derived" / "region-registry"
CACHE = REPO_ROOT / "data" / "raw" / "admdongkor"
DEFAULT_LINKAGE = REPO_ROOT / "data" / "raw" / "external" / "kostat-linkage" / "linkage_20261001.csv"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--linkage", default=str(DEFAULT_LINKAGE))
    args = ap.parse_args()

    lb = pd.read_csv(REG / "layer_boundaries.csv", dtype=str)
    u = pd.read_parquet(REG / "region_units.parquet").set_index("code")
    adm_rows, sgg_rows, anomalies = [], [], []
    for d, version in sorted(set(zip(lb.reference_date, lb.boundary_version))):
        p = CACHE / version / "emd_detail.parquet"
        if not p.exists():
            p = CACHE / version / "emd.parquet"
        g = pd.read_parquet(p, columns=["emd7", "emd8", "emdcd", "emdnm", "sggcd", "sggnm", "sidonm"])
        kost = g.emd8.astype("string").fillna(g.emd7.astype("string"))
        system = "KOSTAT8" if g.emd8.notna().all() else "KOSTAT7"
        e = pd.DataFrame({"kostat": kost, "mois": g.emdcd.astype(str), "name": g.emdnm, "sido": g.sidonm,
                          "kostat_sgg": kost.str[:5],  # sigungu part of the KOSTAT code, within KOSTAT
                          "mois_sgg": g.sggcd.astype(str) + "00000"})
        e = e.drop_duplicates(["kostat", "mois"])  # the same polygon pair listed twice (검암경서동, 20191231)
        dup_k, dup_m = e.kostat.duplicated(keep=False), e.mois.duplicated(keep=False)
        adm_rows.append(e.assign(layer_id=f"kr-admdong@{d}", boundary_version=version, code_system=system,
                                 one_to_one=~(dup_k | dup_m)))
        pairs = e.groupby(["kostat_sgg", "mois_sgg"]).size().rename("n_polygons").reset_index()
        # a stray KOSTAT sigungu carried by a minority of one MOIS sigungu's polygons is a source slip
        # (one 남동구 동 coded 23057 in 20181106); keep the majority pair, record the rest
        pairs = pairs.sort_values("n_polygons", ascending=False)
        stray = pairs.duplicated("mois_sgg") & (pairs.n_polygons <= 2)
        for r in pairs[stray].itertuples():
            anomalies.append({"boundary_version": version, "kostat_sgg": r.kostat_sgg, "mois_sgg": r.mois_sgg,
                              "n_polygons": r.n_polygons, "action": "dropped_minority_pair"})
        pairs = pairs[~stray]
        k_multi = pairs.kostat_sgg.duplicated(keep=False)
        m_multi = pairs.mois_sgg.duplicated(keep=False)
        for r, km, mm in zip(pairs.itertuples(), k_multi, m_multi):
            unit = u.loc[r.mois_sgg] if r.mois_sgg in u.index else None
            lgu = (unit.parent_code if unit is not None and unit.level == "general_gu" else r.mois_sgg) if unit is not None else None
            base = {"reference_date": d, "boundary_version": version, "code_system": "KOSTAT5_" + system[-1],
                    "kostat_code": r.kostat_sgg, "n_polygons": r.n_polygons, "one_to_one": not (km or mm)}
            sgg_rows.append({**base, "layer_id": f"kr-sgg@{d}", "mois_code": r.mois_sgg,
                             "mois_name": None if unit is None else unit["name"], "method": "same_polygon_codes"})
            sgg_rows.append({**base, "layer_id": f"kr-lgu@{d}", "mois_code": lgu,
                             "mois_name": None if lgu is None or lgu not in u.index else u.loc[lgu]["name"],
                             "method": "same_polygon_codes+registry_parent" if unit is not None and unit.level == "general_gu"
                             else "same_polygon_codes"})

    sgg = pd.DataFrame(sgg_rows)
    pd.DataFrame(anomalies, columns=["boundary_version", "kostat_sgg", "mois_sgg", "n_polygons", "action"]).to_csv(
        REG / "code_map_source_anomalies.csv", index=False, encoding="utf-8")
    adm = pd.concat(adm_rows, ignore_index=True)
    sgg.to_csv(REG / "code_map_layers.csv", index=False, encoding="utf-8")
    adm.to_parquet(REG / "code_map_layers_admdong.parquet", index=False)

    # ---- official linkage check and override ---------------------------------------------------------
    # The linkage file stacks several revisions (개정일자). A layer is checked against the latest revision
    # on or before its date, within a year; where one exists its KOSTAT codes are the official ones and
    # replace the polygon-derived ones (admdongkor gives provisional codes after the 2026-07 reorganisation).
    report = {}
    lk_path = Path(args.linkage)
    if lk_path.exists():
        lk = pd.read_csv(lk_path, dtype=str, encoding="utf-8-sig")
        level_of = u.level.to_dict()
        lk["mois_level"] = lk["행정동코드"].map(level_of)
        checks = []
        for d in sorted(lb.reference_date.unique()):
            revs = [r for r in sorted(lk["개정일자"].unique()) if r <= d and (pd.Timestamp(d) - pd.Timestamp(r)).days < 366]
            if not revs:
                continue
            rev = revs[-1]
            off = lk[lk["개정일자"] == rev]
            for level, lv, klen in (("admdong", ["admin_dong"], 8), ("sgg", ["lgu", "general_gu"], 5)):
                o = off[off.mois_level.isin(lv) & (off["행정구역코드"].str.len() == klen)]
                off_pairs = set(zip(o["행정구역코드"], o["행정동코드"]))
                if level == "admdong":
                    mine_df = adm[adm.layer_id == f"kr-admdong@{d}"]
                    mine = set(zip(mine_df.kostat, mine_df.mois))
                else:
                    mine_df = sgg[sgg.layer_id == f"kr-sgg@{d}"]
                    mine = set(zip(mine_df.kostat_code, mine_df.mois_code))
                    # a city with general-gu also appears as its own row in the official file; the sgg layer has its gu instead
                    layer_codes = set(pd.read_parquet(REG / "layer_units.parquet").pipe(lambda m: m[m.layer_id == f"kr-sgg@{d}"]).code)
                    off_pairs = {(k, m) for k, m in off_pairs if m in layer_codes}
                lbr = lb[lb.layer_id == f"kr-{level}@{d}"].iloc[0]
                no_poly = set(str(lbr.no_polygon).split("|")) - {"", "nan"}
                off_by_m = {m: k for k, m in off_pairs}
                mine_by_m = {m: k for k, m in mine}
                for m in sorted(set(off_by_m) | set(mine_by_m)):
                    k_off, k_mine = off_by_m.get(m), mine_by_m.get(m)
                    if k_off == k_mine:
                        continue
                    reason = ("no_polygon_unit" if m in no_poly and k_mine is None else
                              "kostat_code_differs" if k_off and k_mine else
                              "official_only" if k_off else "ours_only")
                    checks.append({"layer_id": f"kr-{level}@{d}", "revision": rev, "mois": m,
                                   "kostat_official": k_off, "kostat_ours": k_mine, "reason": reason})
                report[f"kr-{level}@{d}"] = {"revision": rev, "official": len(off_pairs), "ours": len(mine),
                                             "same": len(off_pairs & mine)}
                # official codes win for this layer
                if level == "admdong":
                    hit = adm.layer_id == f"kr-admdong@{d}"
                    adm.loc[hit, "kostat_official"] = adm.loc[hit, "mois"].map(off_by_m)
                else:
                    for lid in (f"kr-sgg@{d}",):
                        hit = sgg.layer_id == lid
                        sgg.loc[hit, "kostat_official"] = sgg.loc[hit, "mois_code"].map(off_by_m)
        chk = pd.DataFrame(checks, columns=["layer_id", "revision", "mois", "kostat_official", "kostat_ours", "reason"])
        chk.to_csv(REG / "code_map_linkage_check.csv", index=False, encoding="utf-8")
        for lid, r in report.items():
            r.update(chk[chk.layer_id == lid].reason.value_counts().to_dict())
        # final code: official where the layer has a revision, else the polygon-derived one
        adm["kostat_final"] = adm.get("kostat_official").fillna(adm.kostat) if "kostat_official" in adm else adm.kostat
        adm["kostat_source"] = adm.get("kostat_official").notna().map({True: "official_linkage", False: "boundary_polygon"})             if "kostat_official" in adm else "boundary_polygon"
        if "kostat_official" not in sgg:
            sgg["kostat_official"] = None
        # the lgu rows follow their sgg rows' official code where present
        sgg_off = sgg[sgg.layer_id.str.startswith("kr-sgg")].set_index(["reference_date", "kostat_code"]).kostat_official.dropna().to_dict()
        lg = sgg.layer_id.str.startswith("kr-lgu")
        sgg.loc[lg, "kostat_official"] = [sgg_off.get((d, k)) for d, k in zip(sgg[lg].reference_date, sgg[lg].kostat_code)]
        sgg["kostat_final"] = sgg.kostat_official.fillna(sgg.kostat_code)
        sgg["kostat_source"] = sgg.kostat_official.notna().map({True: "official_linkage", False: "boundary_polygon"})
        sgg.to_csv(REG / "code_map_layers.csv", index=False, encoding="utf-8")
        adm.to_parquet(REG / "code_map_layers_admdong.parquet", index=False)
    (REG / "code_map_layers.manifest.json").write_text(json.dumps({
        "layers": int(sgg.layer_id.nunique()), "sgg_pairs": int((sgg.layer_id.str.startswith("kr-sgg")).sum()),
        "not_one_to_one": int((~sgg.one_to_one).sum()), "admdong_pairs": len(adm),
        "admdong_not_one_to_one": int((~adm.one_to_one).sum()), "linkage_check": report,
    }, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=1, default=str)[:2500])
    print("sgg pairs not 1:1:", int((~sgg.one_to_one).sum()), "| admdong pairs not 1:1:", int((~adm.one_to_one).sum()))


if __name__ == "__main__":
    main()
