import type { AtlasCrsDefinition } from "./types";

export const ATLAS_ANALYSIS_CRS = "EPSG:5179";
export const ATLAS_DISPLAY_CRS = "EPSG:3857";
export const ATLAS_WEB_COORD_CRS = "EPSG:4326";

export const CRS_REGISTRY: AtlasCrsDefinition[] = [
  {
    id: "EPSG:5179",
    epsg: 5179,
    label: "Korea 2000 / Unified CS",
    role: "analysis",
    unit: "metre",
    notes: "Atlas KR default metric analysis CRS for distance, area, overlay and grid-oriented processing.",
  },
  {
    id: "EPSG:4326",
    epsg: 4326,
    label: "WGS 84",
    role: "source",
    unit: "degree",
    notes: "Common API/POI coordinate system and portable exchange CRS. Source coordinates are preserved when providers return WGS84.",
  },
  {
    id: "EPSG:3857",
    epsg: 3857,
    label: "WGS 84 / Pseudo-Mercator",
    role: "display",
    unit: "metre",
    notes: "Common web-map tile/display CRS. It is not the default CRS for Korea-wide metric analysis.",
  },
  {
    id: "EPSG:5186",
    epsg: 5186,
    label: "Korea 2000 / Central Belt 2010",
    role: "supported",
    unit: "metre",
    notes: "Common Korean projected CRS encountered in public geospatial files. Normalize only when an analysis/export requires it.",
  },
];

export const getCrs = (id: string) => CRS_REGISTRY.find((item) => item.id.toUpperCase() === id.toUpperCase());
