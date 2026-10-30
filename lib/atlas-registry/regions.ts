import type { AtlasRegionRef, AtlasRegionRelation, AtlasRegionRelationType, AtlasRegionType } from "./types";

export const REGION_REGISTRY_META = {
  sourceId: "mois-code",
  legalCodeCatalogUrl: "https://www.code.go.kr/stdcode/regCodeL.do",
  fullDownloadUrl: "https://www.code.go.kr/stdcodesrch/codeAllDownloadL.do",
  changeNoticeUrl: "https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardList.do?bbsId=BBSMSTR_000000000052",
  policy: "Preserve official codes and validity periods; never rewrite historical codes in place.",
} as const;

export interface MoisRegionInput {
  regionType: AtlasRegionType;
  officialCode: string | number;
  name: string;
  parentAtlasRegionId?: string | null;
  validFrom?: string;
  validTo?: string | null;
  boundaryVersion?: string;
  residentCode?: string | number | null;
  cadastralCode?: string | number | null;
  legalCode?: string | number | null;
}

export function normalizeOfficialCode(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const code = String(value).trim();
  return code.length ? code : null;
}

function dateToken(value?: string) {
  if (!value) return "current";
  return value.replace(/[^0-9]/g, "") || "current";
}

export function makeAtlasRegionId(regionType: AtlasRegionType, officialCode: string | number, validFrom?: string) {
  const code = normalizeOfficialCode(officialCode);
  if (!code) throw new Error("officialCode is required");
  return `kr:${regionType}:${code}:${dateToken(validFrom)}`;
}

export function normalizeMoisRegion(input: MoisRegionInput): AtlasRegionRef {
  const officialCode = normalizeOfficialCode(input.officialCode);
  if (!officialCode) throw new Error("MOIS region row is missing an official code");
  const name = input.name.trim();
  if (!name) throw new Error(`MOIS region ${officialCode} is missing a name`);

  return {
    atlasRegionId: makeAtlasRegionId(input.regionType, officialCode, input.validFrom),
    regionType: input.regionType,
    officialCode,
    name,
    sourceId: "mois-code",
    parentAtlasRegionId: input.parentAtlasRegionId ?? null,
    validFrom: input.validFrom,
    validTo: input.validTo ?? null,
    boundaryVersion: input.boundaryVersion,
    residentCode: normalizeOfficialCode(input.residentCode),
    cadastralCode: normalizeOfficialCode(input.cadastralCode),
    legalCode: normalizeOfficialCode(input.legalCode),
  };
}

export function makeRegionRelation(options: {
  relationType: AtlasRegionRelationType;
  fromRegionIds?: string[];
  toRegionIds?: string[];
  effectiveDate?: string;
  sourceRecordId?: string;
  notes?: string;
}): AtlasRegionRelation {
  const fromRegionIds = [...new Set(options.fromRegionIds ?? [])];
  const toRegionIds = [...new Set(options.toRegionIds ?? [])];
  if (!fromRegionIds.length && !toRegionIds.length) {
    throw new Error("A region relation needs at least one source or target region");
  }

  const key = [
    options.relationType,
    options.effectiveDate ?? "undated",
    fromRegionIds.join("+"),
    toRegionIds.join("+"),
  ].join(":");

  return {
    id: `mois:${key}`,
    relationType: options.relationType,
    fromRegionIds,
    toRegionIds,
    effectiveDate: options.effectiveDate,
    sourceId: "mois-code",
    sourceRecordId: options.sourceRecordId,
    notes: options.notes,
  };
}

export function isRegionActiveAt(region: AtlasRegionRef, isoDate: string) {
  const target = Date.parse(isoDate);
  if (Number.isNaN(target)) throw new Error(`Invalid date: ${isoDate}`);
  const start = region.validFrom ? Date.parse(region.validFrom) : Number.NEGATIVE_INFINITY;
  const end = region.validTo ? Date.parse(region.validTo) : Number.POSITIVE_INFINITY;
  return target >= start && target <= end;
}

export function regionJoinKey(region: AtlasRegionRef) {
  return `${region.regionType}:${region.officialCode}`;
}
