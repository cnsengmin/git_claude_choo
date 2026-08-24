import { makeRegionRelation, normalizeMoisRegion } from "@/lib/atlas-registry/regions";
import type { AtlasRegionRef, AtlasRegionRelation, AtlasRegionType } from "@/lib/atlas-registry/types";

export type KikFileKind = "KIKcd_H" | "KIKcd_B" | "KIKmix";

export interface KikAdminRow {
  adminCode: string;
  sidoName: string;
  sigunguName: string;
  eupMyeonDongName: string;
  createdAt: string;
  abolishedAt: string;
}

export interface KikLegalRow {
  legalCode: string;
  sidoName: string;
  sigunguName: string;
  eupMyeonDongName: string;
  dongRiName: string;
  createdAt: string;
  abolishedAt: string;
}

export interface KikMixRow {
  adminCode: string;
  sidoName: string;
  sigunguName: string;
  eupMyeonDongName: string;
  legalCode: string;
  dongRiName: string;
  createdAt: string;
  abolishedAt: string;
}

type Slice = readonly [start: number, end: number];

const H_LAYOUT = {
  adminCode: [0, 10],
  sidoName: [11, 41],
  sigunguName: [42, 72],
  eupMyeonDongName: [73, 103],
  createdAt: [104, 112],
  abolishedAt: [113, 121],
} satisfies Record<keyof KikAdminRow, Slice>;

const B_LAYOUT = {
  legalCode: [0, 10],
  sidoName: [11, 41],
  sigunguName: [42, 72],
  eupMyeonDongName: [73, 103],
  dongRiName: [104, 134],
  createdAt: [135, 143],
  abolishedAt: [144, 152],
} satisfies Record<keyof KikLegalRow, Slice>;

const MIX_LAYOUT = {
  adminCode: [0, 10],
  sidoName: [11, 41],
  sigunguName: [42, 72],
  eupMyeonDongName: [73, 103],
  legalCode: [104, 114],
  dongRiName: [115, 145],
  createdAt: [146, 154],
  abolishedAt: [155, 163],
} satisfies Record<keyof KikMixRow, Slice>;

const decoder = new TextDecoder("euc-kr");

function splitLines(input: Uint8Array) {
  const lines: Uint8Array[] = [];
  let start = 0;
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] !== 0x0a) continue;
    let end = index;
    if (end > start && input[end - 1] === 0x0d) end -= 1;
    lines.push(input.subarray(start, end));
    start = index + 1;
  }
  if (start < input.length) {
    let end = input.length;
    if (input[end - 1] === 0x0d) end -= 1;
    lines.push(input.subarray(start, end));
  }
  return lines;
}

function decodeField(line: Uint8Array, slice: Slice) {
  const [start, end] = slice;
  return decoder.decode(line.subarray(start, end)).trim();
}

function parseRows<T extends object>(input: Uint8Array, layout: { [K in keyof T]: Slice }): T[] {
  const lines = splitLines(input);
  if (lines.length <= 1) return [];
  return lines.slice(1).filter((line) => line.length > 0).map((line) => {
    const row = {} as { [K in keyof T]: string };
    for (const key of Object.keys(layout) as Array<keyof T>) {
      row[key] = decodeField(line, layout[key]);
    }
    return row as T;
  });
}

export const parseKikAdminFile = (input: Uint8Array) => parseRows<KikAdminRow>(input, H_LAYOUT);
export const parseKikLegalFile = (input: Uint8Array) => parseRows<KikLegalRow>(input, B_LAYOUT);
export const parseKikMixFile = (input: Uint8Array) => parseRows<KikMixRow>(input, MIX_LAYOUT);

export function parseKikFile(input: Uint8Array, kind: KikFileKind) {
  if (kind === "KIKcd_H") return parseKikAdminFile(input);
  if (kind === "KIKcd_B") return parseKikLegalFile(input);
  return parseKikMixFile(input);
}

function isoDate(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length !== 8) return undefined;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/**
 * KIK administrative codes are hierarchical, but a simple sido -> sigungu -> dong
 * assumption is not sufficient. A general city can contain autonomous/non-autonomous
 * gu records before the dong level (e.g. Anyang-si -> Dongan-gu -> Burim-dong), and
 * Sejong has its own intermediate administrative code. Resolve the parent by finding
 * the longest zero-padded prefix that actually exists in the same snapshot.
 */
export function resolveKikParentCode(code: string, knownCodes: ReadonlySet<string>) {
  if (!/^\d{10}$/.test(code)) return null;
  for (let prefixLength = 9; prefixLength >= 2; prefixLength -= 1) {
    const candidate = `${code.slice(0, prefixLength)}${"0".repeat(10 - prefixLength)}`;
    if (candidate !== code && knownCodes.has(candidate)) return candidate;
  }
  return null;
}

function inferAdminType(row: KikAdminRow): AtlasRegionType {
  if (row.eupMyeonDongName) return "admin-dong";
  if (row.sigunguName) return "sigungu";
  // Some KIK intermediate agencies (for example Sejong's 3611000000) have
  // a blank sigunguName. Their nested position is preserved by parent IDs;
  // the Atlas type remains sigungu for compatibility with the current model.
  if (!row.adminCode.endsWith("00000000")) return "sigungu";
  return "sido";
}

function inferLegalType(row: KikLegalRow): AtlasRegionType {
  if (row.eupMyeonDongName || row.dongRiName) return "legal-dong";
  if (row.sigunguName) return "sigungu";
  if (!row.legalCode.endsWith("00000000")) return "sigungu";
  return "sido";
}

function adminDisplayName(row: KikAdminRow) {
  return row.eupMyeonDongName || row.sigunguName || row.sidoName;
}

function legalDisplayName(row: KikLegalRow) {
  if (row.dongRiName && row.eupMyeonDongName) return `${row.eupMyeonDongName} ${row.dongRiName}`;
  return row.dongRiName || row.eupMyeonDongName || row.sigunguName || row.sidoName;
}

export function normalizeKikAdminRows(rows: KikAdminRow[], snapshotDate?: string): AtlasRegionRef[] {
  const knownCodes = new Set(rows.map((row) => row.adminCode).filter(Boolean));
  return rows.map((row) => {
    const regionType = inferAdminType(row);
    const parentCode = resolveKikParentCode(row.adminCode, knownCodes);
    const validFrom = isoDate(row.createdAt);
    return {
      ...normalizeMoisRegion({
        regionType,
        officialCode: row.adminCode,
        name: adminDisplayName(row),
        parentAtlasRegionId: parentCode ? `external:mois:${parentCode}` : null,
        validFrom,
        validTo: isoDate(row.abolishedAt) ?? null,
      }),
      sourceDatasetId: snapshotDate ? `mois-kik-h-${snapshotDate.replace(/-/g, "")}` : "mois-kik-h",
      sourceRecordId: row.adminCode,
      parentOfficialCode: parentCode,
    };
  });
}

export function normalizeKikLegalRows(rows: KikLegalRow[], snapshotDate?: string): AtlasRegionRef[] {
  const knownCodes = new Set(rows.map((row) => row.legalCode).filter(Boolean));
  return rows.map((row) => {
    const regionType = inferLegalType(row);
    const parentCode = resolveKikParentCode(row.legalCode, knownCodes);
    const validFrom = isoDate(row.createdAt);
    return {
      ...normalizeMoisRegion({
        regionType,
        officialCode: row.legalCode,
        name: legalDisplayName(row),
        parentAtlasRegionId: parentCode ? `external:mois:${parentCode}` : null,
        validFrom,
        validTo: isoDate(row.abolishedAt) ?? null,
      }),
      sourceDatasetId: snapshotDate ? `mois-kik-b-${snapshotDate.replace(/-/g, "")}` : "mois-kik-b",
      sourceRecordId: row.legalCode,
      parentOfficialCode: parentCode,
    };
  });
}

export function buildKikMixRelations(rows: KikMixRow[], snapshotDate?: string): AtlasRegionRelation[] {
  const grouped = new Map<string, KikMixRow[]>();
  for (const row of rows) {
    if (!row.eupMyeonDongName || !row.adminCode || !row.legalCode) continue;
    const key = `${row.adminCode}:${row.createdAt}:${row.abolishedAt}`;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }

  return [...grouped.values()].map((group) => {
    const first = group[0];
    return makeRegionRelation({
      relationType: "admin-legal-crosswalk",
      fromRegionIds: [`external:mois:admin:${first.adminCode}`],
      toRegionIds: [...new Set(group.map((row) => `external:mois:legal:${row.legalCode}`))],
      effectiveDate: isoDate(first.createdAt),
      sourceRecordId: `${snapshotDate ?? "snapshot"}:${first.adminCode}`,
      notes: `KIKmix snapshot jurisdiction mapping. Snapshot=${snapshotDate ?? "unknown"}; source abolishedAt=${first.abolishedAt || "blank"}. External refs are resolved against the versioned region registry after ingest.`,
    });
  });
}
