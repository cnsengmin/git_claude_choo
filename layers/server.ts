// Server-side data providers, keyed by the `provider` field of layer.json. A provider gets
// the query and the path after /api/layers/<provider>/, and returns JSON data or a Response.
import { handle as osmOverpass } from "@/layers/providers/osm-overpass/server";
import { handle as regionLayers } from "@/layers/providers/region-layers/server";

export const PROVIDERS: Record<string, (params: URLSearchParams, path: string[]) => Promise<unknown>> = {
  "osm-overpass": osmOverpass,
  "region-layers": regionLayers,
};
