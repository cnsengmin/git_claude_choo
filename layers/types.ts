import type { FilterSpecification } from "maplibre-gl";

export type LayerStatus = "available" | "partial" | "planned";

export type LayerGroupId =
  | "boundaries"
  | "physical"
  | "planning"
  | "mobility"
  | "people"
  | "places";

// layers/<group>/<id>/layer.json
export interface LayerManifest {
  id: string;
  group: LayerGroupId;
  label: string;
  description: string;
  status: LayerStatus;
  source: string;
  // Data module under layers/providers/<provider>/, served at /api/layers/<provider>.
  provider?: string;
  license?: string;
  requiresEnv?: string[];
}

export interface LayerGroup {
  id: LayerGroupId;
  label: string;
  description: string;
}

// layers/<group>/<id>/style.ts: how a provider-backed layer is drawn. The map assigns the
// layer id and source; `order` stacks layers that share a provider (lower draws first).
export interface LayerStyle {
  order: number;
  type: "fill" | "line" | "circle";
  filter?: FilterSpecification;
  paint: Record<string, unknown>;
  // Vector tiles at /api/layers/<provider>/<tiles.path>/{z}/{x}/{y}.pbf instead of the
  // provider's GeoJSON response.
  tiles?: { path: string; sourceLayer: string; minzoom: number; maxzoom: number };
  // A date or year chosen in the sidebar. Layers with the same `key` share one selector.
  time?: LayerTime;
  // One popup line for a clicked feature of this layer, at the chosen time.
  describe?: (properties: Record<string, unknown>, time?: string) => string;
  legend?: { title: string; items: { color: string; label: string }[] };
}

export interface LayerTime {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  initial: string;
  // Filter and paint for the chosen value; the filter also applies to the click target.
  apply: (value: string) => { filter?: FilterSpecification; paint?: Record<string, unknown> };
}
