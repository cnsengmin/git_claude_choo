export type SiteLayerStatus = "available" | "partial" | "planned";

export type SiteLayerGroupId =
  | "physical"
  | "planning"
  | "mobility"
  | "people"
  | "places";

export interface SiteLayerDefinition {
  id: string;
  group: SiteLayerGroupId;
  label: string;
  description: string;
  status: SiteLayerStatus;
  source: string;
}

export interface SiteLayerGroup {
  id: SiteLayerGroupId;
  label: string;
  description: string;
}

export const SITE_LAYER_GROUPS: SiteLayerGroup[] = [
  { id: "physical", label: "Physical / Built", description: "건물·도로·지적·지형 등 물리적 도시구조" },
  { id: "planning", label: "Planning", description: "용도지역·지구단위계획·도시계획시설" },
  { id: "mobility", label: "Mobility", description: "대중교통·도로망·보행 접근성" },
  { id: "people", label: "People & Economy", description: "인구·사업체·고용·유동인구" },
  { id: "places", label: "Places & Activity", description: "POI·의료·생활시설·핫플" },
];

export const SITE_LAYERS: SiteLayerDefinition[] = [
  { id: "buildings", group: "physical", label: "건물", description: "건물 footprint와 건축물 기본 형상", status: "partial", source: "OSM 즉시 보기 + 건축물 공간정보(예정)" },
  { id: "building-use", group: "physical", label: "건물 용도", description: "주용도 및 건축물 용도 분포", status: "planned", source: "건축물대장" },
  { id: "building-age", group: "physical", label: "건축 연대", description: "사용승인일 기반 건축연대", status: "planned", source: "건축물대장" },
  { id: "building-height", group: "physical", label: "높이·층수", description: "고층/저층 및 2.5D extrusion", status: "planned", source: "건축물대장 / VWorld" },
  { id: "roads", group: "physical", label: "도로", description: "도로 및 가로망 구조", status: "partial", source: "OSM 즉시 보기 + 국가공간정보(예정)" },
  { id: "green-water", group: "physical", label: "녹지·하천", description: "공원·녹지·하천 및 오픈스페이스", status: "partial", source: "OSM 즉시 보기 + 토지피복/공공자료(예정)" },
  { id: "terrain", group: "physical", label: "지형·등고선", description: "DEM 기반 지형과 등고선", status: "planned", source: "국토정보플랫폼 DEM" },
  { id: "cadastral", group: "physical", label: "지적", description: "필지 경계와 토지 단위", status: "planned", source: "연속지적도" },

  { id: "zoning", group: "planning", label: "용도지역", description: "도시계획 용도지역·지구·구역", status: "planned", source: "국토부 / VWorld / 토지이음" },
  { id: "district-plan", group: "planning", label: "지구단위계획", description: "지구단위계획 구역과 계획정보", status: "planned", source: "도시계획정보 / UPIS" },
  { id: "planned-facilities", group: "planning", label: "도시계획시설", description: "도로·공원 등 도시계획시설 결정", status: "planned", source: "국토부 도시계획시설정보" },
  { id: "land-use", group: "planning", label: "토지이용", description: "현재 토지이용 및 피복 맥락", status: "partial", source: "OSM 즉시 보기 + 공식 토지피복지도(예정)" },

  { id: "transit", group: "mobility", label: "지하철·버스", description: "역·정류장 및 대중교통 시설", status: "planned", source: "국가/지자체 교통 OpenAPI" },
  { id: "walk-access", group: "mobility", label: "보행 접근성", description: "생활시설까지의 보행 네트워크 접근성", status: "planned", source: "도로망 + Network analysis" },

  { id: "population-100m", group: "people", label: "100m 인구", description: "격자 인구와 연령구조", status: "planned", source: "SGIS 인구격자" },
  { id: "business-stats", group: "people", label: "사업체 통계", description: "업종별 사업체·종사자 및 시계열", status: "planned", source: "SGIS / 전국사업체조사" },
  { id: "employment", group: "people", label: "고용·종사자", description: "종사자 밀도와 직주 구조", status: "planned", source: "사업체 통계" },
  { id: "floating-pop", group: "people", label: "생활·유동인구", description: "생활이동·유동인구 기반 활동성", status: "planned", source: "지자체 / 생활이동 데이터" },

  { id: "live-poi", group: "places", label: "실시간 POI", description: "현재 지도 주변 장소 검색", status: "available", source: "Kakao / Naver / Google" },
  { id: "medical", group: "places", label: "의료시설", description: "병원·의원 등 공식 의료기관", status: "available", source: "HIRA" },
  { id: "food-cafe", group: "places", label: "음식·카페", description: "음식점·카페·베이커리 탐색", status: "partial", source: "Kakao / Naver / Google" },
  { id: "convenience", group: "places", label: "편의점·소매", description: "편의점 및 생활 소매시설", status: "partial", source: "Kakao / Naver / Google + 공공자료" },
  { id: "culture", group: "places", label: "문화·여가", description: "영화관·도서관·문화시설", status: "partial", source: "공공데이터 + POI providers" },
  { id: "hotspot", group: "places", label: "Hot Place", description: "사업체·유동·웹 신호를 결합한 활동 클러스터", status: "planned", source: "Atlas HotScore" },
];

export const SITE_PRESETS: Record<string, { label: string; layerIds: string[] }> = {
  architecture: {
    label: "건축 Site",
    layerIds: ["buildings", "building-use", "building-age", "building-height", "roads", "terrain", "cadastral", "zoning"],
  },
  neighborhood: {
    label: "생활권",
    layerIds: ["roads", "green-water", "transit", "population-100m", "business-stats", "live-poi", "medical"],
  },
  commercial: {
    label: "상권·활동",
    layerIds: ["business-stats", "employment", "floating-pop", "live-poi", "food-cafe", "convenience", "culture", "hotspot"],
  },
};
