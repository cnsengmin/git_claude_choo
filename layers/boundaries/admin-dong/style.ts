import { applyBoundaryDate, BOUNDARY_DATE, describeBoundary } from "@/layers/providers/region-layers/dates";
import type { LayerStyle } from "@/layers/types";

export const style: LayerStyle = {
  order: 70,
  type: "line",
  tiles: { path: "admdong", sourceLayer: "admdong", minzoom: 8, maxzoom: 12 },
  paint: { "line-color": "#6b7a99", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.3, 14, 1], "line-opacity": 0.75, "line-dasharray": [2, 1.5] },
  controls: [BOUNDARY_DATE],
  apply: applyBoundaryDate,
  describe: describeBoundary("행정동"),
};
