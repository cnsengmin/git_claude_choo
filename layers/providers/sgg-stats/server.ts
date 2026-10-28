import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LayerRequestError } from "@/layers/providers/errors";
import { parseCsv } from "@/lib/atlas-data/csv";

// 2025 sigungu table (229 base units, data/derived/sgg2025) as JSON for the map.
const TABLE = join(process.cwd(), "data", "derived", "sgg2025", "lgu229_2025.csv");
const ID_COLUMNS = new Set(["lgu_code", "lgu_name", "sido_code", "sido_name", "kostat_code", "kostat7_2026_code", "lfs_code"]);

export type SggStatsUnit = { code5: string; name: string; sido: string; values: Record<string, number | null> };
export type SggStatsResponse = { year: number; boundaryDate: string; units: SggStatsUnit[] };

let cached: Promise<SggStatsResponse> | undefined;

async function load(): Promise<SggStatsResponse> {
  const rows = parseCsv(await readFile(TABLE, "utf8"));
  const units = rows.map((row) => ({
    code5: row.lgu_code,
    name: row.lgu_name,
    sido: row.sido_name,
    values: Object.fromEntries(Object.entries(row)
      .filter(([key]) => !ID_COLUMNS.has(key))
      .map(([key, value]) => [key, value === "" ? null : Number(value)])),
  }));
  return { year: 2025, boundaryDate: "2025-12-31", units };
}

// GET /api/layers/sgg-stats/2025
export async function handle(_params: URLSearchParams, path: string[] = []): Promise<unknown> {
  if (path.length !== 1 || path[0] !== "2025") throw new LayerRequestError("expected /2025");
  cached ??= load().catch((error) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
