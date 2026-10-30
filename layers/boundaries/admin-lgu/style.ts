import { applyBoundaryDate, BOUNDARY_DATE, describeBoundary } from "@/layers/providers/region-layers/dates";
import type { LayerStyle } from "@/layers/types";

export const style: LayerStyle = {
  order: 50,
  type: "line",
  tiles: { path: "lgu", sourceLayer: "lgu", minzoom: 4, maxzoom: 12 },
  featureKey: "code",
  paint: { "line-color": "#1f2a44", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 12, 2.2], "line-opacity": 0.85 },
  controls: [BOUNDARY_DATE],
  apply: applyBoundaryDate,
  describe: describeBoundary("기초 단위"),
};
