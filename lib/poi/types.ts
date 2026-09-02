export type PoiProvider = "kakao" | "naver" | "google" | "hira" | "public";
export type PoiSourceKind = "live" | "official";

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
  sourceKind?: PoiSourceKind;
  query?: string;
  count: number;
  totalAvailable?: number;
  areaLabel?: string;
  items: AtlasPoi[];
  retrievedAt: string;
  warning?: string;
}
