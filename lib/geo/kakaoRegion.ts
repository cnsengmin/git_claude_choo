import { circleSamplePoints, type GeoPoint } from "./distance";

type KakaoRegionDocument = {
  region_type: "H" | "B";
  address_name: string;
  region_1depth_name: string;
  region_2depth_name: string;
  region_3depth_name: string;
  region_4depth_name: string;
  code: string;
  x: number;
  y: number;
};

type KakaoRegionResponse = {
  documents?: KakaoRegionDocument[];
};

export type AtlasRegion = {
  type: "legal" | "administrative";
  code: string;
  addressName: string;
  sidoName: string;
  sigunguName: string;
  dongName: string;
};

async function lookupRegion(point: GeoPoint): Promise<KakaoRegionDocument[]> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new Error("KAKAO_REST_API_KEY is not configured");

  const params = new URLSearchParams({
    x: String(point.lng),
    y: String(point.lat),
    input_coord: "WGS84",
    output_coord: "WGS84",
  });

  const response = await fetch(`https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?${params}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Kakao region lookup failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as KakaoRegionResponse;
  return data.documents ?? [];
}

function toAtlasRegion(document: KakaoRegionDocument): AtlasRegion {
  return {
    type: document.region_type === "B" ? "legal" : "administrative",
    code: document.code,
    addressName: document.address_name,
    sidoName: document.region_1depth_name,
    sigunguName: document.region_2depth_name,
    dongName: document.region_3depth_name,
  };
}

export async function resolveLegalRegionsForCircle(center: GeoPoint, radiusM: number): Promise<AtlasRegion[]> {
  const sampled = circleSamplePoints(center, radiusM);
  const results = await Promise.all(sampled.map((point) => lookupRegion(point)));
  const legalRegions = results
    .flat()
    .filter((document) => document.region_type === "B" && document.region_3depth_name)
    .map(toAtlasRegion);

  const deduped = new Map<string, AtlasRegion>();
  legalRegions.forEach((region) => deduped.set(region.code || region.addressName, region));
  return [...deduped.values()];
}

export async function resolveCenterAdministrativeRegion(center: GeoPoint): Promise<AtlasRegion | undefined> {
  const documents = await lookupRegion(center);
  const administrative = documents.find((document) => document.region_type === "H" && document.region_3depth_name);
  return administrative ? toAtlasRegion(administrative) : undefined;
}

export async function resolveCenterRegion(center: GeoPoint): Promise<AtlasRegion | undefined> {
  const documents = await lookupRegion(center);
  const legal = documents.find((document) => document.region_type === "B");
  const administrative = documents.find((document) => document.region_type === "H");
  const picked = legal ?? administrative;
  return picked ? toAtlasRegion(picked) : undefined;
}
