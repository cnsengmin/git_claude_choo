import { makeRegionRelation, normalizeMoisRegion, normalizeOfficialCode } from "@/lib/atlas-registry/regions";
import type { AtlasRegionRef, AtlasRegionRelation, AtlasRegionType } from "@/lib/atlas-registry/types";

type RawRow = Record<string, unknown>;

const pick = (row: RawRow, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
};

const toText = (value: unknown) => (value === undefined || value === null ? undefined : String(value).trim());

export interface MoisAdapterOptions {
  regionType: AtlasRegionType;
  boundaryVersion?: string;
  effectiveDate?: string;
}

/**
 * Normalize a row exported from code.go.kr/MOIS while tolerating common Korean
 * column labels. The raw official code is never cast to number, so leading zeros
 * are not lost.
 */
export function normalizeMoisExportRow(row: RawRow, options: MoisAdapterOptions): AtlasRegionRef {
  const officialCode = pick(row, [
    "행정동코드",
    "법정동코드",
    "지역코드",
    "기관코드",
    "region_code",
    "official_code",
  ]);
  const name = pick(row, [
    "행정동명",
    "법정동명",
    "지역주소명",
    "기관명",
    "최하위지역명",
    "region_name",
    "name",
  ]);

  if (officialCode === undefined) throw new Error("MOIS/code.go row has no recognizable official-code column");
  if (name === undefined) throw new Error(`MOIS/code.go row ${String(officialCode)} has no recognizable name column`);

  const createdAt = toText(pick(row, ["생성일", "생성일자", "created_at", "valid_from"])) ?? options.effectiveDate;
  const abolishedAt = toText(pick(row, ["폐지일", "폐지일자", "abolished_at", "valid_to"]));
  const parentCode = normalizeOfficialCode(pick(row, ["상위지역코드", "상위기관코드", "parent_code"]) as string | number | undefined);
  const residentCode = pick(row, ["지역코드_주민", "주민등록행정코드", "resident_code"]);
  const cadastralCode = pick(row, ["지역코드_지적", "지적코드", "cadastral_code"]);
  const legalCode = pick(row, ["법정동코드", "법정동(리)코드", "legal_code"]);

  return normalizeMoisRegion({
    regionType: options.regionType,
    officialCode: String(officialCode),
    name: String(name),
    parentAtlasRegionId: parentCode ? `external:mois:${parentCode}` : null,
    validFrom: createdAt,
    validTo: abolishedAt ?? null,
    boundaryVersion: options.boundaryVersion,
    residentCode: residentCode as string | number | null | undefined,
    cadastralCode: cadastralCode as string | number | null | undefined,
    legalCode: legalCode as string | number | null | undefined,
  });
}

export function normalizeMoisExportRows(rows: RawRow[], options: MoisAdapterOptions) {
  const regions: AtlasRegionRef[] = [];
  const errors: Array<{ index: number; message: string }> = [];

  rows.forEach((row, index) => {
    try {
      regions.push(normalizeMoisExportRow(row, options));
    } catch (error) {
      errors.push({ index, message: error instanceof Error ? error.message : "Unknown normalization error" });
    }
  });

  return { regions, errors };
}

export function buildAdminLegalCrosswalk(options: {
  adminRegionId: string;
  legalRegionIds: string[];
  effectiveDate?: string;
  sourceRecordId?: string;
}): AtlasRegionRelation {
  return makeRegionRelation({
    relationType: "admin-legal-crosswalk",
    fromRegionIds: [options.adminRegionId],
    toRegionIds: options.legalRegionIds,
    effectiveDate: options.effectiveDate,
    sourceRecordId: options.sourceRecordId,
    notes: "Administrative-dong to legal-dong jurisdiction relation; keep it versioned because jurisdiction mappings change over time.",
  });
}
