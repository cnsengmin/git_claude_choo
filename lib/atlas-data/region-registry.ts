import { existsSync } from "node:fs";
import { join } from "node:path";
import { makeAtlasRegionId } from "@/lib/atlas-registry/regions";
import type {
  AtlasCodeMapEntry,
  AtlasCrosswalkEdge,
  AtlasCrosswalkMethod,
  AtlasCrosswalkRow,
  AtlasLayerLevel,
  AtlasLayerVersion,
  AtlasRegionRelation,
  AtlasRegionRelationType,
  AtlasRegionType,
} from "@/lib/atlas-registry/types";
import { readCsv, splitCodes, toNumber } from "./csv";

/**
 * Read-only access to the region layers built by scripts/region_registry/ (Python).
 * Server side only (node:fs). Admdong edges exist only in crosswalk_edges.parquet; the CSV
 * readers here cover the lgu and sgg levels plus the chained admdong table.
 */
export const REGION_REGISTRY_DIR = join(process.cwd(), "data", "derived", "region-registry");

const LEVEL_REGION_TYPE: Record<AtlasLayerLevel, AtlasRegionType> = {
  lgu: "sigungu",
  sgg: "sigungu",
  admdong: "admin-dong",
};

const file = (name: string) => {
  const path = join(REGION_REGISTRY_DIR, name);
  if (!existsSync(path)) throw new Error(`Region registry file not found: ${path} (run scripts/region_registry/)`);
  return path;
};

export function loadLayerVersions(level?: AtlasLayerLevel): AtlasLayerVersion[] {
  const boundaries = new Map(readCsv(file("layer_boundaries.csv")).map((r) => [r.layer_id, r]));
  return readCsv(file("layers.csv"))
    .filter((r) => !level || r.level === level)
    .map((r) => ({
      id: r.layer_id,
      level: r.level as AtlasLayerLevel,
      referenceDate: r.reference_date,
      unitCount: toNumber(r.unit_count),
      boundaryVersion: boundaries.get(r.layer_id)?.boundary_version ?? "",
      status: boundaries.get(r.layer_id)?.status ?? "unchecked",
    }));
}

/** Official change events as Atlas relations; region ids carry each unit's own validFrom. */
export function loadRegionEvents(level?: AtlasLayerLevel): AtlasRegionRelation[] {
  const validFrom = new Map(readCsv(file("region_units.csv")).map((r) => [r.code, r.valid_from]));
  return readCsv(file("events.csv"))
    .filter((r) => !level || r.level === level)
    .map((r) => {
      const regionType = LEVEL_REGION_TYPE[r.level as AtlasLayerLevel];
      const ids = (codes: string) => splitCodes(codes).map((c) => makeAtlasRegionId(regionType, c, validFrom.get(c) || undefined));
      return {
        id: `mois:${r.event_id}`,
        relationType: r.type as AtlasRegionRelationType,
        fromRegionIds: ids(r.from_codes),
        toRegionIds: ids(r.to_codes),
        effectiveDate: r.date_start,
        sourceId: "mois-code",
        sourceRecordId: r.event_id,
        notes: `${r.level}: ${r.from_names || "-"} -> ${r.to_names || "-"}`,
      };
    });
}

export function loadCrosswalkEdges(level?: Exclude<AtlasLayerLevel, "admdong">): AtlasCrosswalkEdge[] {
  return readCsv(file("crosswalk_edges.csv"))
    .filter((r) => !level || r.level === level)
    .map((r) => ({
      level: r.level as AtlasLayerLevel,
      fromLayer: r.from_layer,
      toLayer: r.to_layer,
      fromCode: r.from_code,
      toCode: r.to_code,
      wSrc: toNumber(r.w_src),
      wTgt: toNumber(r.w_tgt),
      wSrcPop: toNumber(r.w_src_pop),
      wTgtPop: toNumber(r.w_tgt_pop),
      method: r.method as AtlasCrosswalkMethod,
      eventIds: splitCodes(r.event_ids),
      popYear: r.pop_year ? Math.round(toNumber(r.pop_year)) : null,
    }));
}

/** Chained crosswalk from every earlier layer to a base layer, e.g. ("lgu", "2025-12-31"). */
export function loadCrosswalkTable(level: AtlasLayerLevel, baseDate: string): AtlasCrosswalkRow[] {
  return readCsv(file(join("crosswalk", `${level}_to_${baseDate.replace(/-/g, "")}.csv`))).map((r) => ({
    fromDate: r.from_date,
    toDate: r.to_date,
    fromCode: r.from_code,
    fromSido: r.from_sido,
    fromName: r.from_name,
    toCode: r.to_code,
    toSido: r.to_sido,
    toName: r.to_name,
    wSrc: toNumber(r.w_src),
    wSrcPop: toNumber(r.w_src_pop),
    wTgt: toNumber(r.w_tgt),
    wTgtPop: toNumber(r.w_tgt_pop),
    alloc: r.alloc === "True",
  }));
}

/** KOSTAT codes per lgu/sgg layer unit (admdong codes are in code_map_layers_admdong.parquet). */
export function loadCodeMap(layer?: string): AtlasCodeMapEntry[] {
  return readCsv(file("code_map_layers.csv"))
    .filter((r) => !layer || r.layer_id === layer)
    .map((r) => ({
      layer: r.layer_id,
      codeSystem: r.code_system,
      code: r.kostat_final,
      baseCode: r.mois_code,
      method: r.method,
      evidence: r.kostat_source,
    }));
}
