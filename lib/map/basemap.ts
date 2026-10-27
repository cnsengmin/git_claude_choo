import type { StyleSpecification } from "maplibre-gl";

// OpenStreetMap standard raster tiles. Fine for the MVP's light traffic under the OSM tile
// usage policy (https://operations.osmfoundation.org/policies/tiles/); set
// NEXT_PUBLIC_MAP_STYLE_URL to a hosted vector style before heavier use.
const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export const BASEMAP_STYLE: StyleSpecification | string = process.env.NEXT_PUBLIC_MAP_STYLE_URL || OSM_RASTER_STYLE;
