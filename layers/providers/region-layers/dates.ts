// Layer dates in the region-layer tiles and the per-date flag each feature carries
// (scripts/region_registry/build_release_pmtiles.py). Client-safe.
export const BOUNDARY_DATES = [
  ...Array.from({ length: 18 }, (_, index) => {
    const year = 2008 + index;
    return { date: `${year}-12-31`, flag: `d${year}` };
  }),
  { date: "2026-10-01", flag: "d202610" },
];

export const DEFAULT_BOUNDARY_DATE = "2025-12-31";

export const boundaryFlag = (date: string) => BOUNDARY_DATES.find((item) => item.date === date)?.flag ?? "d2025";
