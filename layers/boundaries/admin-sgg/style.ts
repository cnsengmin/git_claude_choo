import { BOUNDARY_TIME, describeBoundary } from "@/layers/providers/region-layers/dates";
import type { LayerStyle } from "@/layers/types";

export const style: LayerStyle = {
  order: 60,
  type: "line",
  tiles: { path: "sgg", sourceLayer: "sgg", minzoom: 5, maxzoom: 12 },
  paint: { "line-color": "#3b4a6b", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 12, 1.4], "line-opacity": 0.8 },
  time: BOUNDARY_TIME,
  describe: describeBoundary("시군구"),
};
