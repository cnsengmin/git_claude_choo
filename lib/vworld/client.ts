const VWORLD_BASE_URL = "https://api.vworld.kr/req";

export type VWorldBbox = [number, number, number, number];

function requireVworldKey() {
  const key = process.env.VWORLD_API_KEY;
  if (!key) throw new Error("VWORLD_API_KEY is not configured");
  return key;
}

export const isVworldConfigured = () => Boolean(process.env.VWORLD_API_KEY);

export function buildVworldWmtsTileUrl(
  layer: "Base" | "Satellite" | "Hybrid",
  z: number | string,
  y: number | string,
  x: number | string,
) {
  const key = requireVworldKey();
  return `${VWORLD_BASE_URL}/wmts/1.0.0/${encodeURIComponent(key)}/${layer}/${z}/${y}/${x}.png`;
}

export function buildVworldWmsUrl(options: {
  layers: string[];
  styles?: string[];
  bbox: VWorldBbox;
  crs?: string;
  width?: number;
  height?: number;
  format?: "image/png" | "image/jpeg";
}) {
  const key = requireVworldKey();
  const params = new URLSearchParams({
    service: "WMS",
    request: "GetMap",
    version: "1.3.0",
    key,
    layers: options.layers.join(","),
    styles: (options.styles ?? options.layers).join(","),
    crs: options.crs ?? "EPSG:3857",
    bbox: options.bbox.join(","),
    width: String(options.width ?? 512),
    height: String(options.height ?? 512),
    format: options.format ?? "image/png",
    transparent: "true",
  });
  return `${VWORLD_BASE_URL}/wms?${params.toString()}`;
}

export async function fetchVworldWfs(options: {
  typeName: string;
  bbox?: VWorldBbox;
  srsName?: string;
  maxFeatures?: number;
  propertyNames?: string[];
}) {
  const key = requireVworldKey();
  const maxFeatures = Math.min(Math.max(options.maxFeatures ?? 200, 1), 1000);
  const params = new URLSearchParams({
    service: "WFS",
    request: "GetFeature",
    version: "1.1.0",
    key,
    typename: options.typeName,
    output: "application/json",
    srsname: options.srsName ?? "EPSG:4326",
    maxfeatures: String(maxFeatures),
  });

  if (options.bbox) params.set("bbox", options.bbox.join(","));
  if (options.propertyNames?.length) params.set("propertyname", options.propertyNames.join(","));

  const response = await fetch(`${VWORLD_BASE_URL}/wfs?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`VWorld WFS request failed: ${response.status} ${await response.text()}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) return response.json();
  return response.text();
}
