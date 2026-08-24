const KOSIS_BASE_URL = "https://kosis.kr/openapi";

type KosisRawRow = Record<string, unknown>;

function requireKosisKey() {
  const key = process.env.KOSIS_API_KEY;
  if (!key) throw new Error("KOSIS_API_KEY is not configured");
  return key;
}

export const isKosisConfigured = () => Boolean(process.env.KOSIS_API_KEY);

async function fetchKosisJson(path: string, params: URLSearchParams) {
  const response = await fetch(`${KOSIS_BASE_URL}/${path}?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`KOSIS request failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  if (!Array.isArray(data)) {
    const message = typeof data?.errMsg === "string" ? data.errMsg : typeof data?.message === "string" ? data.message : null;
    if (message) throw new Error(`KOSIS error: ${message}`);
  }
  return data as KosisRawRow[];
}

export async function searchKosis(query: string, options?: { orgId?: string; page?: number; pageSize?: number; sort?: "RANK" | "DATE" }) {
  const term = query.trim();
  if (!term) throw new Error("KOSIS search query is required");
  const params = new URLSearchParams({
    method: "getList",
    apiKey: requireKosisKey(),
    searchNm: term,
    format: "json",
    startCount: String(Math.max(options?.page ?? 1, 1)),
    resultCount: String(Math.min(Math.max(options?.pageSize ?? 20, 1), 100)),
    sort: options?.sort ?? "RANK",
  });
  if (options?.orgId) params.set("orgId", options.orgId);
  return fetchKosisJson("statisticsSearch.do", params);
}

export interface KosisStatisticsRequest {
  orgId: string;
  tableId: string;
  itemId: string;
  objectLevel1: string;
  periodType: string;
  startPeriod?: string;
  endPeriod?: string;
  latestCount?: number;
  objectLevels?: Record<string, string>;
  outputFields?: string[];
}

export async function fetchKosisStatistics(request: KosisStatisticsRequest) {
  const params = new URLSearchParams({
    method: "getList",
    apiKey: requireKosisKey(),
    orgId: request.orgId,
    tblId: request.tableId,
    itmId: request.itemId,
    objL1: request.objectLevel1,
    prdSe: request.periodType,
    format: "json",
    jsonVD: "Y",
  });

  Object.entries(request.objectLevels ?? {}).forEach(([key, value]) => {
    if (/^objL[2-8]$/.test(key) && value) params.set(key, value);
  });

  if (request.startPeriod) params.set("startPrdDe", request.startPeriod);
  if (request.endPeriod) params.set("endPrdDe", request.endPeriod);
  if (!request.startPeriod && !request.endPeriod && request.latestCount) params.set("newEstPrdCnt", String(request.latestCount));
  if (request.outputFields?.length) params.set("outputFields", request.outputFields.join(","));

  return fetchKosisJson("Param/statisticsParameterData.do", params);
}

const first = (row: KosisRawRow, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return null;
};

export interface AtlasKosisStatisticRow {
  sourceId: "kosis";
  organizationId: string | null;
  tableId: string | null;
  tableName: string | null;
  itemId: string | null;
  itemName: string | null;
  classificationId: string | null;
  classificationName: string | null;
  period: string | null;
  value: number | null;
  rawValue: string | null;
  unit: string | null;
  updatedAt: string | null;
}

export function normalizeKosisStatisticRow(row: KosisRawRow): AtlasKosisStatisticRow {
  const rawValue = first(row, ["DT", "dt", "VALUE", "value"]);
  const numericValue = rawValue === null ? null : Number(rawValue.replace(/,/g, ""));
  return {
    sourceId: "kosis",
    organizationId: first(row, ["ORG_ID", "orgId"]),
    tableId: first(row, ["TBL_ID", "tblId"]),
    tableName: first(row, ["TBL_NM", "tblNm"]),
    itemId: first(row, ["ITM_ID", "itmId"]),
    itemName: first(row, ["ITM_NM", "itmNm"]),
    classificationId: first(row, ["C1", "OBJ_ID", "objId"]),
    classificationName: first(row, ["C1_NM", "OBJ_NM", "objNm"]),
    period: first(row, ["PRD_DE", "prdDe"]),
    value: rawValue !== null && Number.isFinite(numericValue) ? numericValue : null,
    rawValue,
    unit: first(row, ["UNIT_NM", "UNIT", "unitNm"]),
    updatedAt: first(row, ["LST_CHN_DE", "SEND_DE", "updatedAt"]),
  };
}
