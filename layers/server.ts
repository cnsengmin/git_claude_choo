// Server-side data providers, keyed by the `provider` field of layer.json.
import { handle as osmOverpass } from "@/layers/providers/osm-overpass/server";

export const PROVIDERS: Record<string, (params: URLSearchParams) => Promise<unknown>> = {
  "osm-overpass": osmOverpass,
};
