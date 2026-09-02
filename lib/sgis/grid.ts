import { makeSgisGridRef, makeSgisGridStatistic } from "@/lib/atlas-registry/grids";

type RawRow = Record<string, unknown>;

const pick = (row: RawRow, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
};

function toNullableNumber(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const normalized = String(value).replace(/,/g, "").trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export interface SgisGridRowOptions {
  gridSizeM: 100 | 500 | 1000;
  year: number;
  indicatorId: string;
  unit: string;
  valueColumns?: string[];
}

/**
 * SGIS 자료제공 files have changed field labels across products/years.
 * Atlas therefore preserves the native boundary/grid code and supports a
 * small alias list instead of assuming one permanent header name.
 */
export function normalizeSgisGridRow(row: RawRow, options: SgisGridRowOptions) {
  const nativeGridId = pick(row, [
    "boundary_code",
    "BOUNDARY_CODE",
    "grid_cd",
    "GRID_CD",
    "grid_id",
    "GRID_ID",
    "gid",
    "GID",
    options.gridSizeM === 1000 ? "GRID_1K_CD" : "",
  ].filter(Boolean));

  if (nativeGridId === undefined) {
    throw new Error("SGIS grid row has no recognizable native grid/boundary code");
  }

  const value = pick(row, options.valueColumns ?? ["value", "VALUE", "val", "VAL", "population", "business", "workers"]);
  return makeSgisGridStatistic({
    nativeGridId: String(nativeGridId),
    gridSizeM: options.gridSizeM,
    year: options.year,
    indicatorId: options.indicatorId,
    value: toNullableNumber(value),
    unit: options.unit,
  });
}

export function normalizeSgisGridRows(rows: RawRow[], options: SgisGridRowOptions) {
  const values: ReturnType<typeof normalizeSgisGridRow>[] = [];
  const errors: Array<{ index: number; message: string }> = [];

  rows.forEach((row, index) => {
    try {
      values.push(normalizeSgisGridRow(row, options));
    } catch (error) {
      errors.push({ index, message: error instanceof Error ? error.message : "Unknown normalization error" });
    }
  });

  return { values, errors };
}

export function gridRefFromSgisBoundaryRow(row: RawRow, gridSizeM: 100 | 500 | 1000) {
  const nativeGridId = pick(row, ["boundary_code", "BOUNDARY_CODE", "grid_cd", "GRID_CD", "grid_id", "GRID_ID", "gid", "GID", "GRID_1K_CD"]);
  if (nativeGridId === undefined) throw new Error("SGIS boundary row has no recognizable native grid ID");
  return makeSgisGridRef(String(nativeGridId), gridSizeM);
}
