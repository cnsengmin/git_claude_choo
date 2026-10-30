import type { AtlasGridRef, AtlasGridSystemDefinition } from "./types";

export const GRID_SYSTEM_REGISTRY: AtlasGridSystemDefinition[] = [
  {
    id: "sgis",
    providerId: "sgis",
    title: "SGIS national statistical grid",
    sizesM: [100, 500, 1000],
    crs: "EPSG:5179",
    nativeIdPolicy: "preserve",
    notes: "Atlas keeps the SGIS/native boundary code unchanged and only namespaces it for cross-provider uniqueness.",
  },
];

export function normalizeNativeGridId(value: string | number) {
  const nativeGridId = String(value).trim();
  if (!nativeGridId) throw new Error("nativeGridId is required");
  return nativeGridId;
}

export function makeAtlasGridId(gridSystem: string, gridSizeM: 100 | 500 | 1000, nativeGridId: string | number) {
  return `${gridSystem}:${gridSizeM}m:${normalizeNativeGridId(nativeGridId)}`;
}

export function makeSgisGridRef(nativeGridId: string | number, gridSizeM: 100 | 500 | 1000): AtlasGridRef {
  const id = normalizeNativeGridId(nativeGridId);
  return {
    atlasGridId: makeAtlasGridId("sgis", gridSizeM, id),
    nativeGridId: id,
    gridSystem: "sgis",
    gridSizeM,
    crs: "EPSG:5179",
  };
}

export interface AtlasGridStatisticRow {
  atlasGridId: string;
  nativeGridId: string;
  gridSystem: string;
  gridSizeM: 100 | 500 | 1000;
  year: number;
  indicatorId: string;
  value: number | null;
  unit: string;
  sourceId: string;
}

export function makeSgisGridStatistic(options: {
  nativeGridId: string | number;
  gridSizeM: 100 | 500 | 1000;
  year: number;
  indicatorId: string;
  value: number | null;
  unit: string;
}): AtlasGridStatisticRow {
  const grid = makeSgisGridRef(options.nativeGridId, options.gridSizeM);
  return {
    atlasGridId: grid.atlasGridId,
    nativeGridId: grid.nativeGridId,
    gridSystem: grid.gridSystem,
    gridSizeM: grid.gridSizeM,
    year: options.year,
    indicatorId: options.indicatorId,
    value: options.value,
    unit: options.unit,
    sourceId: "sgis",
  };
}
