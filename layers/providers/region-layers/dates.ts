import type { FilterSpecification } from "maplibre-gl";
import type { LayerControl } from "@/layers/types";

// Layer dates in the region-layer tiles and the per-date flag each feature carries
// (scripts/region_registry/build_release_pmtiles.py). Client-safe.
export const BOUNDARY_DATES = [
  ...Array.from({ length: 18 }, (_, index) => {
    const year = 2008 + index;
    return { date: `${year}-12-31`, flag: `d${year}` };
  }),
  { date: "2026-10-01", flag: "d202610" },
];

const boundaryFlag = (date: string) => BOUNDARY_DATES.find((item) => item.date === date)?.flag ?? "d2025";

// One date selector shared by the boundary layers.
export const BOUNDARY_DATE: LayerControl = {
  key: "boundary-date",
  label: "경계 시점",
  options: BOUNDARY_DATES.map((item) => ({ value: item.date, label: item.date })),
  initial: "2025-12-31",
};

export const applyBoundaryDate = (selection: Record<string, string>) => ({
  filter: ["==", ["get", boundaryFlag(selection[BOUNDARY_DATE.key])], 1] as FilterSpecification,
});

export const describeBoundary = (level: string) => (properties: Record<string, unknown>) => {
  const { name, code, kostat } = properties as Record<string, string>;
  return `${level} ${name} · 행안부 ${code}${kostat ? ` · 통계청 ${kostat}` : ""}`;
};
