import { normalizeCategory } from "../category";
import type { AtlasPoi, PoiSearchResponse } from "../types";

type NaverItem = {
  title: string;
  link: string;
  category: string;
  description: string;
  telephone: string;
  address: string;
  roadAddress: string;
  mapx: string;
  mapy: string;
};

type NaverResponse = {
  total: number;
  start: number;
  display: number;
  items: NaverItem[];
};

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&");

export async function searchNaverPoi(query: string, sort: "random" | "comment" = "random"): Promise<PoiSearchResponse> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET are not configured");

  const params = new URLSearchParams({ query, display: "5", start: "1", sort });
  const response = await fetch(`https://openapi.naver.com/v1/search/local.json?${params}`, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Naver Local Search failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as NaverResponse;
  const retrievedAt = new Date().toISOString();
  const items: AtlasPoi[] = data.items.map((item, index) => {
    const name = stripHtml(item.title);
    return {
      provider: "naver",
      providerId: `${item.mapx}:${item.mapy}:${index}`,
      name,
      category: normalizeCategory(item.category, name),
      categoryPath: item.category,
      address: item.address || undefined,
      roadAddress: item.roadAddress || undefined,
      phone: item.telephone || undefined,
      url: item.link || undefined,
      retrievedAt,
      metadata: {
        mapx: item.mapx,
        mapy: item.mapy,
        description: stripHtml(item.description || ""),
        sort,
      },
    };
  });

  return {
    provider: "naver",
    query,
    count: items.length,
    items,
    retrievedAt,
    warning: "Naver Local Search is query-oriented and returns up to 5 results per request. Atlas keeps Naver mapx/mapy as provider metadata until a dedicated coordinate normalization step is added.",
  };
}
