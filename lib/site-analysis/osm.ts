export type OsmContextKind = "building" | "road" | "landuse" | "green-water";

type OverpassGeometryPoint = { lat: number; lon: number };
type OverpassWay = {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassGeometryPoint[];
};
type OverpassResponse = { elements?: OverpassWay[] };

export type OsmContextFeature = {
  type: "Feature";
  id: string;
  properties: {
    osmId: number;
    kind: OsmContextKind;
    name?: string;
    tags: Record<string, string>;
  };
  geometry:
    | { type: "LineString"; coordinates: number[][] }
    | { type: "Polygon"; coordinates: number[][][] };
};

export type OsmContextResponse = {
  provider: "osm";
  sourceKind: "open";
  attribution: string;
  retrievedAt: string;
  radius: number;
  counts: Record<OsmContextKind, number>;
  featureCollection: {
    type: "FeatureCollection";
    features: OsmContextFeature[];
  };
  warning: string;
};

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const MAX_RADIUS = 1500;

function classify(tags: Record<string, string>): OsmContextKind | null {
  if (tags.building) return "building";
  if (tags.highway) return "road";
  if (tags.leisure === "park" || tags.leisure === "garden" || tags.natural === "water" || tags.waterway) return "green-water";
  if (tags.landuse) return "landuse";
  return null;
}

function isClosed(points: OverpassGeometryPoint[]) {
  if (points.length < 4) return false;
  const first = points[0];
  const last = points[points.length - 1];
  return first.lat === last.lat && first.lon === last.lon;
}

export async function fetchOsmSiteContext(lat: number, lng: number, requestedRadius: number): Promise<OsmContextResponse> {
  const radius = Math.min(Math.max(Math.round(requestedRadius), 50), MAX_RADIUS);
  const query = `[out:json][timeout:20];\n(\n  way(around:${radius},${lat},${lng})[\"building\"];\n  way(around:${radius},${lat},${lng})[\"highway\"];\n  way(around:${radius},${lat},${lng})[\"landuse\"];\n  way(around:${radius},${lat},${lng})[\"leisure\"~\"^(park|garden)$\"];\n  way(around:${radius},${lat},${lng})[\"natural\"=\"water\"];\n  way(around:${radius},${lat},${lng})[\"waterway\"];\n);\nout tags geom qt;`;

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: query }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`OSM Overpass request failed: ${response.status} ${(await response.text()).slice(0, 240)}`);
  }

  const payload = (await response.json()) as OverpassResponse;
  const features: OsmContextFeature[] = [];

  for (const way of payload.elements ?? []) {
    const tags = way.tags ?? {};
    const points = way.geometry ?? [];
    const kind = classify(tags);
    if (!kind || points.length < 2) continue;

    const coordinates = points.map((point) => [point.lon, point.lat]);
    const polygon = kind !== "road" && isClosed(points);
    features.push({
      type: "Feature",
      id: `way/${way.id}`,
      properties: {
        osmId: way.id,
        kind,
        name: tags.name,
        tags,
      },
      geometry: polygon
        ? { type: "Polygon", coordinates: [coordinates] }
        : { type: "LineString", coordinates },
    });
  }

  const counts: Record<OsmContextKind, number> = {
    building: 0,
    road: 0,
    landuse: 0,
    "green-water": 0,
  };
  features.forEach((feature) => { counts[feature.properties.kind] += 1; });

  const capped = radius !== Math.round(requestedRadius);
  return {
    provider: "osm",
    sourceKind: "open",
    attribution: "© OpenStreetMap contributors (ODbL)",
    retrievedAt: new Date().toISOString(),
    radius,
    counts,
    featureCollection: { type: "FeatureCollection", features },
    warning: `OSM is an open-data context/fallback layer, not an official Korean building, road, cadastral, or planning record.${capped ? ` MVP Overpass load is capped at ${MAX_RADIUS}m.` : ""}`,
  };
}
