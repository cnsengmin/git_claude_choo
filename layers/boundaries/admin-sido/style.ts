import { applyBoundaryDate, BOUNDARY_DATE, describeBoundary } from "@/layers/providers/region-layers/dates";
import type { LayerStyle } from "@/layers/types";

export const style: LayerStyle = {
  order: 45,
  type: "line",
  tiles: { path: "sido", sourceLayer: "sido", minzoom: 4, maxzoom: 10 },
  paint: { "line-color": "#111827", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1, 12, 3], "line-opacity": 0.9 },
  controls: [BOUNDARY_DATE],
  apply: applyBoundaryDate,
  describe: describeBoundary("시도"),
};
