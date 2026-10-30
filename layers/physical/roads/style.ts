import type { LayerStyle } from "@/layers/types";

export const style: LayerStyle = {
  order: 40,
  type: "line",
  filter: ["==", ["get", "kind"], "road"],
  paint: { "line-color": "#4f5661", "line-width": 1.25, "line-opacity": 0.72 },
};
