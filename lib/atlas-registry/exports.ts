import type { AtlasExportProfile } from "./types";

export const EXPORT_PROFILES: AtlasExportProfile[] = [
  {
    id: "web",
    title: "Web map",
    target: "web",
    primaryFormats: ["geojson", "pmtiles", "cog"],
    preserveSourceCrs: true,
    defaultOutputCrs: "EPSG:4326",
    notes: "Prefer lightweight web formats. Large nationwide vectors should move toward PMTiles rather than raw GeoJSON.",
  },
  {
    id: "data",
    title: "Open data package",
    target: "data",
    primaryFormats: ["csv", "parquet", "geoparquet", "geojson", "cog"],
    preserveSourceCrs: true,
    notes: "Machine-readable export for Python/R/SQL workflows with provenance sidecars.",
  },
  {
    id: "qgis",
    title: "QGIS-ready package",
    target: "qgis",
    primaryFormats: ["geopackage", "geotiff", "cog", "csv"],
    preserveSourceCrs: true,
    defaultOutputCrs: "EPSG:5179",
    notes: "GeoPackage is the first multi-layer vector target; raster remains GeoTIFF/COG and metadata is bundled alongside.",
  },
  {
    id: "cad",
    title: "CAD-ready package",
    target: "cad",
    primaryFormats: ["dxf", "json-manifest"],
    preserveSourceCrs: true,
    defaultOutputCrs: "EPSG:5179",
    notes: "Derived geometry export for building/road/parcel/contour layers. CRS and unit metadata are mandatory because DXF alone is not self-describing enough.",
  },
  {
    id: "mcp",
    title: "MCP analysis package",
    target: "mcp",
    primaryFormats: ["geopackage", "geojson", "geoparquet", "parquet", "cog", "json-manifest"],
    preserveSourceCrs: true,
    notes: "Designed for QGIS MCP, later CAD MCP, and agent workflows that need layer discovery plus reproducible source/CRS metadata.",
  },
];
