import { normalizeCategory } from "../category";
import type { AtlasPoi, PoiSearchResponse } from "../types";

type KakaoDocument = {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  category_group_name: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
  place_url: string;
  distance: string;
};

type KakaoResponse = {
  documents: KakaoDocument[];
  meta?: { total_count?: number; pageable_count?: number; is_end?: boolean };
};

export type KakaoSearchInput = {
  query: string;
  x?: number;
  y?: number;
  radius?: number;
  rect?: string;
  page?: number;
  size?: number;
  sort?: "accuracy" | "distance";
};

export async function searchKakaoPoi(input: KakaoSearchInput): Promise<PoiSearchResponse> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new Error("KAKAO_REST_API_KEY is not configured");

  const params = new URLSearchParams({ query: input.query });
  if (input.x !== undefined) params.set("x", String(input.x));
  if (input.y !== undefined) params.set("y", String(input.y));
  if (input.radius !== undefined) params.set("radius", String(Math.min(Math.max(input.radius, 0), 20000)));
  if (input.rect) params.set("rect", input.rect);
  if (input.page) params.set("page", String(input.page));
  if (input.size) params.set("size", String(Math.min(Math.max(input.size, 1), 15)));
  if (input.sort) params.set("sort", input.sort);

  const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Kakao Local API failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as KakaoResponse;
  const retrievedAt = new Date().toISOString();
  const items: AtlasPoi[] = data.documents.map((item) => ({
    provider: "kakao",
    providerId: item.id,
    name: item.place_name,
    category: normalizeCategory(item.category_name, item.place_name),
    categoryPath: item.category_name,
    address: item.address_name || undefined,
    roadAddress: item.road_address_name || undefined,
    lng: Number(item.x),
    lat: Number(item.y),
    phone: item.phone || undefined,
    url: item.place_url || undefined,
    distanceM: item.distance ? Number(item.distance) : undefined,
    retrievedAt,
    metadata: {
      categoryGroupCode: item.category_group_code || null,
      categoryGroupName: item.category_group_name || null,
    },
  }));

  return { provider: "kakao", query: input.query, count: items.length, items, retrievedAt };
}
