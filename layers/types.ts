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
  // Vector tiles at /api/layers/<tiles.provider ?? provider>/<tiles.path>/{z}/{x}/{y}.pbf
  // instead of the provider's GeoJSON response; `tiles.provider` lets a layer draw on another
  // provider's tiles (e.g. statistics on boundary tiles).
  tiles?: { provider?: string; path: string; sourceLayer: string; minzoom: number; maxzoom: number };
  // Sidebar selectors (a date, a year, an indicator). Layers using the same control key share
  // one selector.
  controls?: LayerControl[];
  // JSON at /api/layers/<provider>/<data> that the map loads once and hands to apply,
  // describe and legend.
  data?: string;
  // Filter and paint for the chosen control values; the filter also applies to the click target.
  apply?: (selection: Record<string, string>, data?: unknown) => { filter?: FilterSpecification; paint?: Record<string, unknown> };
  // Popup lines for a clicked feature of this layer, shown under the layer's own heading.
  describe?: (properties: Record<string, unknown>, selection: Record<string, string>, data?: unknown) => string | string[];
  // Property that names one unit (grid cell, output area, boundary code); the clicked unit is
  // outlined until its popup closes.
  featureKey?: string;
  legend?: LayerLegend | ((selection: Record<string, string>, data?: unknown) => LayerLegend | undefined);
}

export interface LayerLegend {
  title: string;
  items: { color: string; label: string }[];
  note?: string;
}

export interface LayerControl {
  key: string;
  label: string;
  options: { value: string; label: string; group?: string }[];
  initial: string;
}
