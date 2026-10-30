import type { AtlasPoiCategory } from "./types";

const includesAny = (value: string, needles: string[]) =>
  needles.some((needle) => value.includes(needle));

export function normalizeCategory(path = "", name = ""): AtlasPoiCategory {
  const value = `${path} ${name}`.toLowerCase();

  if (includesAny(value, ["편의점", "convenience"])) return "convenience";
  if (includesAny(value, ["약국", "pharmacy"])) return "pharmacy";
  if (includesAny(value, ["병원", "의원", "치과", "한의", "medical", "clinic", "hospital"])) return "medical";
  if (includesAny(value, ["영화관", "cinema", "movie theater", "movie theatre"])) return "cinema";
  if (includesAny(value, ["카페", "커피", "cafe", "coffee", "베이커리", "bakery"])) return "cafe";
  if (includesAny(value, ["음식", "한식", "중식", "일식", "양식", "restaurant", "food", "주점", "bar"])) return "food";
  if (includesAny(value, ["마트", "쇼핑", "소매", "retail", "store", "백화점", "시장"])) return "retail";
  if (includesAny(value, ["공연", "박물관", "미술관", "도서관", "문화", "museum", "gallery", "library"])) return "culture";
  if (includesAny(value, ["학교", "학원", "대학교", "education", "school", "academy", "university"])) return "education";
  if (includesAny(value, ["지하철", "역", "버스", "transport", "station", "terminal"])) return "transport";
  if (includesAny(value, ["호텔", "숙박", "lodging", "hotel", "motel", "guesthouse"])) return "lodging";
  if (includesAny(value, ["공공", "주민센터", "구청", "시청", "경찰", "소방", "public", "government"])) return "public";
  if (includesAny(value, ["회사", "기업", "사무실", "office", "company"])) return "office";
  if (includesAny(value, ["미용", "세탁", "수리", "서비스", "salon", "service"])) return "service";

  return "other";
}
