import type { LayerStyle } from "@/layers/types";

export const style: LayerStyle = {
  order: 20,
  type: "fill",
  filter: ["==", ["get", "kind"], "green-water"],
  paint: { "fill-color": "#7fa68a", "fill-opacity": 0.35 },
};
