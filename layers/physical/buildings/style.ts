import type { LayerStyle } from "@/layers/types";

export const style: LayerStyle = {
  order: 30,
  type: "fill",
  filter: ["==", ["get", "kind"], "building"],
  paint: { "fill-color": "#5f6670", "fill-opacity": 0.42, "fill-outline-color": "#444b55" },
};
