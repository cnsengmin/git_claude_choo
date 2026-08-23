import { XMLParser } from "fast-xml-parser";
import { distanceMeters, type GeoPoint } from "@/lib/geo/distance";
import { resolveLegalRegionsForCircle, type AtlasRegion } from "@/lib/geo/kakaoRegion";
import { normalizeCategory } from "../category";
import type { AtlasPoi, PoiSearchResponse } from "../types";

type HiraHospital = {
  ykiho?: string;
  yadmNm?: string;
  clCd?: string;
  clCdNm?: string;
  sidoCdNm?: string;
  sgguCdNm?: string;
  emdongNm?: string;
  addr?: string;
  telno?: string;
  hospUrl?: string;
  estbDd?: string;
  drTotCnt?: string;
  XPos?: string;
  YPos?: string;
  xPos?: string;
  yPos?: string;
};

type HiraPage = {
  items: HiraHospital[];
  totalCount: number;
};

const HIRA_HOSPITAL_URL = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";
const PAGE_SIZE = 500;
const MAX_PAGES_PER_DONG = 2;

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
});

const asArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
};

const asFiniteNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function decodedServiceKey(raw: string): string {
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const compact = (value = "") => value.replace(/\s+/g, "").trim();
const compactSido = (value = "") =>
  compact(value).replace(/특별자치도$|특별자치시$|특별시$|광역시$|도$/u, "");

function sameArea(item: HiraHospital, region: AtlasRegion): boolean {
  const hiraSido = compactSido(item.sidoCdNm);
  const regionSido = compactSido(region.sidoName);
  if (hiraSido && regionSido && hiraSido !== regionSido) return false;

  const hiraSggu = compact(item.sgguCdNm);
  const regionSggu = compact(region.sigunguName);
  if (!hiraSggu || !regionSggu) return true;
  if (hiraSggu === regionSggu) return true;

  const regionLast = compact(region.sigunguName.split(" ").at(-1));
  const hiraLast = compact((item.sgguCdNm ?? "").split(" ").at(-1));
  return Boolean(regionLast && hiraLast && regionLast === hiraLast);
}

async function fetchHiraPage(region: AtlasRegion, pageNo: number, serviceKey: string): Promise<HiraPage> {
  const params = new URLSearchParams({
    ServiceKey: decodedServiceKey(serviceKey),
    pageNo: String(pageNo),
    numOfRows: String(PAGE_SIZE),
    emdongNm: region.dongName,
  });

  const response = await fetch(`${HIRA_HOSPITAL_URL}?${params}`, { cache: "no-store" });
  const text = await response.text();
  if (!response.ok) throw new Error(`HIRA hospital API failed: ${response.status} ${text.slice(0, 240)}`);

  const parsed = parser.parse(text) as Record<string, any>;
  const root = parsed?.response;
  const resultCode = String(root?.header?.resultCode ?? "");
  if (!root || (resultCode && resultCode !== "00" && resultCode !== "0000")) {
    const message = root?.header?.resultMsg ?? parsed?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnAuthMsg ?? text.slice(0, 240);
    throw new Error(`HIRA hospital API error: ${message}`);
  }

  const rawItems = asArray<HiraHospital>(root?.body?.items?.item).filter((item) => sameArea(item, region));
  const totalCount = asFiniteNumber(root?.body?.totalCount) ?? rawItems.length;
  return { items: rawItems, totalCount };
}

async function fetchRegionHospitals(region: AtlasRegion, serviceKey: string): Promise<{ items: HiraHospital[]; truncated: boolean }> {
  const first = await fetchHiraPage(region, 1, serviceKey);
  const pages = Math.min(MAX_PAGES_PER_DONG, Math.max(1, Math.ceil(first.totalCount / PAGE_SIZE)));
  const rest = pages > 1
    ? await Promise.all(Array.from({ length: pages - 1 }, (_, index) => fetchHiraPage(region, index + 2, serviceKey)))
    : [];

  return {
    items: [first, ...rest].flatMap((page) => page.items),
    truncated: first.totalCount > PAGE_SIZE * MAX_PAGES_PER_DONG,
  };
}

const genericMedicalQuery = (query?: string) => {
  const value = query?.trim().replace(/\s+/g, "") ?? "";
  return !value || ["병원", "의원", "병의원", "의료", "의료기관", "의료시설"].includes(value);
};

export type HiraSearchInput = {
  lat: number;
  lng: number;
  radius: number;
  query?: string;
};

export async function searchHiraHospitals(input: HiraSearchInput): Promise<PoiSearchResponse> {
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey) throw new Error("DATA_GO_KR_SERVICE_KEY is not configured");
  if (!process.env.KAKAO_REST_API_KEY) {
    throw new Error("KAKAO_REST_API_KEY is required to resolve the current map center to Korean legal-dong names");
  }

  const center: GeoPoint = { lat: input.lat, lng: input.lng };
  const radius = Math.max(100, Math.min(input.radius, 5000));
  const regions = await resolveLegalRegionsForCircle(center, radius);
  if (!regions.length) throw new Error("No Korean legal-dong region could be resolved for the current map center");

  const regionResults = await Promise.all(regions.map((region) => fetchRegionHospitals(region, serviceKey)));
  const deduped = new Map<string, HiraHospital>();
  regionResults.flatMap((result) => result.items).forEach((item) => {
    const key = item.ykiho || `${item.yadmNm ?? ""}:${item.addr ?? ""}`;
    if (key) deduped.set(key, item);
  });

  const retrievedAt = new Date().toISOString();
  const useNameFilter = !genericMedicalQuery(input.query);
  const nameFilter = input.query?.trim().toLowerCase() ?? "";

  const items: AtlasPoi[] = [...deduped.values()]
    .map((item): AtlasPoi | null => {
      const lat = asFiniteNumber(item.YPos ?? item.yPos);
      const lng = asFiniteNumber(item.XPos ?? item.xPos);
      if (lat === undefined || lng === undefined) return null;
      const distanceM = Math.round(distanceMeters(center, { lat, lng }));
      if (distanceM > radius) return null;

      const name = item.yadmNm?.trim() || "의료기관";
      if (useNameFilter && !name.toLowerCase().includes(nameFilter)) return null;
      const categoryPath = item.clCdNm?.trim() || "의료기관";

      return {
        provider: "hira",
        providerId: item.ykiho || `${name}:${item.addr ?? ""}`,
        name,
        category: normalizeCategory(categoryPath, name),
        categoryPath,
        address: item.addr || undefined,
        lat,
        lng,
        phone: item.telno || undefined,
        url: item.hospUrl || undefined,
        distanceM,
        retrievedAt,
        metadata: {
          source: "건강보험심사평가원 병원정보서비스",
          facilityClassCode: item.clCd || null,
          facilityClass: item.clCdNm || null,
          establishedDate: item.estbDd || null,
          doctorCount: asFiniteNumber(item.drTotCnt) ?? null,
          sido: item.sidoCdNm || null,
          sigungu: item.sgguCdNm || null,
          emdong: item.emdongNm || null,
        },
      };
    })
    .filter((item): item is AtlasPoi => item !== null)
    .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));

  const truncated = regionResults.some((result) => result.truncated);
  const areaLabel = `${regions[0].addressName} 중심 ${radius >= 1000 ? `${(radius / 1000).toFixed(1)}km` : `${radius}m`}`;
  const warningParts = [
    "공식 의료기관 레이어: 건강보험심사평가원 병원정보서비스를 사용합니다.",
    "현재 반경과 만나는 법정동을 표본 좌표로 확인한 뒤 HIRA 좌표로 실제 거리를 다시 계산합니다.",
  ];
  if (truncated) warningParts.push("일부 법정동의 원천 응답이 MVP 페이지 상한을 넘어 결과가 일부 생략될 수 있습니다.");

  return {
    provider: "hira",
    sourceKind: "official",
    query: input.query,
    count: items.length,
    totalAvailable: deduped.size,
    areaLabel,
    items,
    retrievedAt,
    warning: warningParts.join(" "),
  };
}
