import type { LayerStyle } from "@/layers/types";

export const style: LayerStyle = {
  order: 10,
  type: "fill",
  filter: ["==", ["get", "kind"], "landuse"],
  paint: { "fill-color": "#c7cbd1", "fill-opacity": 0.22 },
};
