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

function parentOfficialCode(code: string, regionType: AtlasRegionType) {
  if (!/^\d{10}$/.test(code)) return null;
  if (regionType === "sigungu") return `${code.slice(0, 2)}00000000`;
  if (regionType === "admin-dong" || regionType === "legal-dong") return `${code.slice(0, 5)}00000`;
  return null;
}

function inferAdminType(row: KikAdminRow): AtlasRegionType {
  if (row.eupMyeonDongName) return "admin-dong";
  if (row.sigunguName) return "sigungu";
  return "sido";
}

function inferLegalType(row: KikLegalRow): AtlasRegionType {
  if (row.eupMyeonDongName || row.dongRiName) return "legal-dong";
  if (row.sigunguName) return "sigungu";
  return "sido";
}

function legalDisplayName(row: KikLegalRow) {
  if (row.dongRiName && row.eupMyeonDongName) return `${row.eupMyeonDongName} ${row.dongRiName}`;
  return row.dongRiName || row.eupMyeonDongName || row.sigunguName || row.sidoName;
}

export function normalizeKikAdminRows(rows: KikAdminRow[], snapshotDate?: string): AtlasRegionRef[] {
  return rows.map((row) => {
    const regionType = inferAdminType(row);
    const parentCode = parentOfficialCode(row.adminCode, regionType);
    const validFrom = isoDate(row.createdAt);
    return {
      ...normalizeMoisRegion({
        regionType,
        officialCode: row.adminCode,
        name: row.eupMyeonDongName || row.sigunguName || row.sidoName,
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
  return rows.map((row) => {
    const regionType = inferLegalType(row);
    const parentCode = parentOfficialCode(row.legalCode, regionType);
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
