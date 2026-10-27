import type { FilterSpecification } from "maplibre-gl";

export type LayerStatus = "available" | "partial" | "planned";

export type LayerGroupId =
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
}
