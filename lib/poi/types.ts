export type PoiProvider = "kakao" | "naver" | "google" | "public";

export type AtlasPoiCategory =
  | "food"
  | "cafe"
  | "retail"
  | "convenience"
  | "medical"
  | "pharmacy"
  | "culture"
  | "cinema"
  | "education"
  | "transport"
  | "public"
  | "lodging"
  | "office"
  | "service"
  | "other";

export interface AtlasPoi {
  provider: PoiProvider;
  providerId: string;
  name: string;
  category: AtlasPoiCategory;
  categoryPath?: string;
  address?: string;
  roadAddress?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  url?: string;
  distanceM?: number;
  rating?: number;
  reviewCount?: number;
  openNow?: boolean;
  retrievedAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface PoiSearchResponse {
  provider: PoiProvider;
  query?: string;
  count: number;
  items: AtlasPoi[];
  retrievedAt: string;
  warning?: string;
}
