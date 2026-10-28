import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LayerRequestError } from "@/layers/providers/errors";
import { parseCsv } from "@/lib/atlas-data/csv";

// Sigungu statistics on the 229 base units of 2025-12-31, as JSON for the map:
//   /2025   the 2025 single-year table (data/derived/sgg2025)
//   /panel  the 2008-2025 panel (data/derived/sgg-panel), one array per variable by year
const TABLE = join(process.cwd(), "data", "derived", "sgg2025", "lgu229_2025.csv");
const PANEL = join(process.cwd(), "data", "derived", "sgg-panel", "lgu229_panel.csv");
const ID_COLUMNS = new Set(["lgu_code", "lgu_name", "sido_code", "sido_name", "kostat_code", "kostat7_2026_code", "lfs_code"]);
const PANEL_COLUMNS = new Set(["lgu_code", "lgu_name", "year", "alloc_share"]);

export type SggStatsUnit = { code5: string; name: string; sido: string; values: Record<string, number | null> };
export type SggStatsResponse = { year: number; boundaryDate: string; units: SggStatsUnit[] };

// values[variable][i] and alloc[i] belong to years[i]; alloc is the share that came from
// split units (> 0 only before 2012 for 세종·공주·청주).
export type SggPanelUnit = { code5: string; name: string; values: Record<string, (number | null)[]>; alloc: number[] };
export type SggPanelResponse = { years: number[]; boundaryDate: string; variables: string[]; units: SggPanelUnit[] };

const asNumber = (value: string) => (value === "" ? null : Number(value));

async function loadTable(): Promise<SggStatsResponse> {
  const rows = parseCsv(await readFile(TABLE, "utf8"));
  const units = rows.map((row) => ({
    code5: row.lgu_code,
    name: row.lgu_name,
    sido: row.sido_name,
    values: Object.fromEntries(Object.entries(row)
      .filter(([key]) => !ID_COLUMNS.has(key))
      .map(([key, value]) => [key, asNumber(value)])),
  }));
  return { year: 2025, boundaryDate: "2025-12-31", units };
}

async function loadPanel(): Promise<SggPanelResponse> {
  const rows = parseCsv(await readFile(PANEL, "utf8"));
  const years = [...new Set(rows.map((row) => Number(row.year)))].sort((a, b) => a - b);
  const variables = Object.keys(rows[0]).filter((key) => !PANEL_COLUMNS.has(key));
  const units = new Map<string, SggPanelUnit>();
  rows.forEach((row) => {
    let unit = units.get(row.lgu_code);
    if (!unit) {
      unit = {
        code5: row.lgu_code,
        name: row.lgu_name,
        values: Object.fromEntries(variables.map((variable) => [variable, years.map(() => null)])),
        alloc: years.map(() => 0),
      };
      units.set(row.lgu_code, unit);
    }
    const index = years.indexOf(Number(row.year));
    variables.forEach((variable) => { unit!.values[variable][index] = asNumber(row[variable]); });
    unit.alloc[index] = Number(row.alloc_share) || 0;
  });
  return { years, boundaryDate: "2025-12-31", variables, units: [...units.values()] };
}

const cache = new Map<string, Promise<unknown>>();
const LOADERS: Record<string, () => Promise<unknown>> = { "2025": loadTable, panel: loadPanel };

// GET /api/layers/sgg-stats/2025 | /api/layers/sgg-stats/panel
export async function handle(_params: URLSearchParams, path: string[] = []): Promise<unknown> {
  const load = path.length === 1 ? LOADERS[path[0]] : undefined;
  if (!load) throw new LayerRequestError("expected /2025 or /panel");
  if (!cache.has(path[0])) {
    cache.set(path[0], load().catch((error) => {
      cache.delete(path[0]);
      throw error;
    }));
  }
  return cache.get(path[0]);
}
