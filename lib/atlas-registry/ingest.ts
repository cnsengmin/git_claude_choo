import { makeAtlasRegionId } from "./regions";
import { makeSgisGridStatistic } from "./grids";
import type { AtlasRegionRef, AtlasRegionType } from "./types";

type DelimitedRow = Record<string, string>;

function cleanText(text: string) {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function splitQuoted(line: string, delimiter: string) {
  const out: string[] = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      out.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  out.push(value.trim());
  return out;
}

function detectDelimiter(headerLine: string) {
  const candidates = ["\t", ",", "|"];
  return candidates
    .map((delimiter) => ({ delimiter, count: splitQuoted(headerLine, delimiter).length }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

export function parseDelimitedText(text: string) {
  const lines = cleanText(text).split("\n").filter((line) => line.trim().length > 0);
  if (!lines.length) return { headers: [] as string[], rows: [] as DelimitedRow[], delimiter: "," };

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitQuoted(lines[0], delimiter).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = splitQuoted(line, delimiter);
    return headers.reduce<DelimitedRow>((record, header, index) => {
      record[header] = cells[index] ?? "";
      return record;
    }, {});
  });

  return { headers, rows, delimiter };
}

function normalizedHeader(value: string) {
  return value.toLowerCase().replace(/[\s_()\-./]/g, "");
}

function pick(row: DelimitedRow, aliases: string[]) {
  const aliasSet = new Set(aliases.map(normalizedHeader));
  const entry = Object.entries(row).find(([key]) => aliasSet.has(normalizedHeader(key)));
  return entry?.[1]?.trim() ?? "";
}

function normalizeDate(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length >= 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return undefined;
}

function inferLegalRegionType(code: string): AtlasRegionType {
  if (/^\d{2}0{8}$/.test(code)) return "sido";
  if (/^\d{5}0{5}$/.test(code)) return "sigungu";
  return "legal-dong";
}

function legalParentCode(code: string, regionType: AtlasRegionType) {
  if (regionType === "sido") return null;
  if (regionType === "sigungu") return `${code.slice(0, 2)}00000000`;
  return `${code.slice(0, 5)}00000`;
}

export function previewLegalDongCodes(text: string, limit = 50) {
  const parsed = parseDelimitedText(text);
  const normalized: AtlasRegionRef[] = [];
  const warnings: string[] = [];

  for (const row of parsed.rows) {
    const officialCode = pick(row, ["법정동코드", "지역코드", "code", "regioncode"]);
    const name = pick(row, ["법정동명", "지역주소명", "name", "regionname"]);
    if (!officialCode || !name) continue;

    const abolished = pick(row, ["폐지여부", "폐지구분", "abolished"]);
    const validFrom = normalizeDate(pick(row, ["생성일", "생성일자", "createdate"]));
    const validTo = normalizeDate(pick(row, ["폐지일", "폐지일자", "abolisheddate"]));
    const regionType = inferLegalRegionType(officialCode);
    const parentOfficialCode = legalParentCode(officialCode, regionType);

    normalized.push({
      atlasRegionId: makeAtlasRegionId(regionType, officialCode, validFrom),
      regionType,
      officialCode,
      name,
      sourceId: "mois-code",
      sourceDatasetId: "mois-legal-dong-codes",
      parentOfficialCode,
      validFrom,
      validTo: validTo ?? null,
      residentCode: pick(row, ["법정동코드주민", "지역코드주민"]) || null,
      cadastralCode: pick(row, ["법정동코드지적", "지역코드지적"]) || null,
    });

    if (abolished && !["0", "존재", "현존", "사용"].includes(abolished)) {
      const current = normalized[normalized.length - 1];
      if (!current.validTo) warnings.push(`${officialCode} ${name}: 폐지 표시가 있으나 폐지일을 찾지 못했습니다.`);
    }
  }

  if (!normalized.length) warnings.push("법정동코드/법정동명(또는 지역코드/지역주소명) 헤더를 인식하지 못했습니다.");

  return {
    kind: "legal-dong" as const,
    datasetId: "mois-legal-dong-codes",
    delimiter: parsed.delimiter === "\t" ? "tab" : parsed.delimiter,
    inputRows: parsed.rows.length,
    normalizedRows: normalized.length,
    headers: parsed.headers,
    sample: normalized.slice(0, Math.max(1, Math.min(limit, 200))),
    warnings,
  };
}

function inferAdminRegionType(code: string, topCode: string, parentCode: string): AtlasRegionType {
  if (topCode && code === topCode) return "sido";
  if (topCode && parentCode && parentCode === topCode) return "sigungu";
  return "admin-dong";
}

export function previewAdminDongClassification(text: string, limit = 50) {
  const parsed = parseDelimitedText(text);
  const normalized: AtlasRegionRef[] = [];
  const warnings: string[] = [];

  for (const row of parsed.rows) {
    const officialCode = pick(row, ["행정동코드", "admincode", "admcode"]);
    const name = pick(row, ["행정동명", "adminname", "admname"]);
    if (!officialCode || !name) continue;

    const topCode = pick(row, ["최상위행정동코드", "topadmincode"]);
    const parentOfficialCode = pick(row, ["부모행정동코드", "parentadmincode"]) || null;
    const revisionDate = normalizeDate(pick(row, ["개정일자", "revisiondate"]));
    const sourceRecordId = pick(row, ["행정동번호", "연결번호", "순번", "id"]);
    const regionType = inferAdminRegionType(officialCode, topCode, parentOfficialCode ?? "");

    normalized.push({
      atlasRegionId: makeAtlasRegionId(regionType, officialCode, revisionDate),
      regionType,
      officialCode,
      name,
      sourceId: "data-go-kr",
      sourceDatasetId: "kostat-admin-dong-classification-20250704",
      sourceRecordId: sourceRecordId || undefined,
      parentOfficialCode,
      revisionDate,
    });
  }

  if (!normalized.length) warnings.push("행정동코드/행정동명 헤더를 인식하지 못했습니다.");
  warnings.push("개정일자는 원자료 revision provenance로 보존하며, valid-to 기간은 변경이력 정렬 단계에서 별도로 계산합니다.");

  return {
    kind: "admin-classification" as const,
    datasetId: "kostat-admin-dong-classification-20250704",
    delimiter: parsed.delimiter === "\t" ? "tab" : parsed.delimiter,
    inputRows: parsed.rows.length,
    normalizedRows: normalized.length,
    headers: parsed.headers,
    sample: normalized.slice(0, Math.max(1, Math.min(limit, 200))),
    warnings,
  };
}

function numberOrNull(value: string) {
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned || /^(na|n\/a|null|bsca|-)$/i.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

export function previewSgisGridStatistics(text: string, options: {
  gridSizeM: 100 | 500 | 1000;
  year: number;
  indicatorId: string;
  unit: string;
  idField?: string;
  valueField?: string;
  limit?: number;
}) {
  const parsed = parseDelimitedText(text);
  const idAliases = options.idField
    ? [options.idField]
    : ["gid", "gridid", "gridcd", "grid100mcd", "grid500mcd", "grid1kcd", "boundarycd", "경계코드", "격자코드"];
  const valueAliases = options.valueField
    ? [options.valueField]
    : ["val", "value", "값", "인구수", "사업체수", "종사자수"];
  const rows = [];

  for (const row of parsed.rows) {
    const nativeGridId = pick(row, idAliases);
    if (!nativeGridId) continue;
    const rawValue = pick(row, valueAliases);
    rows.push(makeSgisGridStatistic({
      nativeGridId,
      gridSizeM: options.gridSizeM,
      year: options.year,
      indicatorId: options.indicatorId,
      value: numberOrNull(rawValue),
      unit: options.unit,
    }));
  }

  const warnings: string[] = [];
  if (!rows.length) warnings.push("격자 ID 필드를 인식하지 못했습니다. idField/valueField를 명시할 수 있습니다.");
  warnings.push("이 preview는 통계 TXT/CSV의 native grid ID를 보존합니다. SHP 경계 geometry 결합은 동일 native code를 사용해 별도 단계에서 수행합니다.");

  return {
    kind: "sgis-grid" as const,
    datasetId: "sgis-small-area-grid",
    delimiter: parsed.delimiter === "\t" ? "tab" : parsed.delimiter,
    inputRows: parsed.rows.length,
    normalizedRows: rows.length,
    headers: parsed.headers,
    sample: rows.slice(0, Math.max(1, Math.min(options.limit ?? 50, 200))),
    warnings,
  };
}
