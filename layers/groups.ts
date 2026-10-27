import type { LayerGroup } from "./types";

export const LAYER_GROUPS: LayerGroup[] = [
  { id: "physical", label: "Physical / Built", description: "건물·도로·지적·지형 등 물리적 도시구조" },
  { id: "planning", label: "Planning", description: "용도지역·지구단위계획·도시계획시설" },
  { id: "mobility", label: "Mobility", description: "대중교통·도로망·보행 접근성" },
  { id: "people", label: "People & Economy", description: "인구·사업체·고용·유동인구" },
  { id: "places", label: "Places & Activity", description: "POI·의료·생활시설·핫플" },
];

export const LAYER_PRESETS: Record<string, { label: string; layerIds: string[] }> = {
  architecture: {
    label: "건축 Site",
    layerIds: ["buildings", "building-use", "building-age", "building-height", "roads", "terrain", "cadastral", "zoning"],
  },
  neighborhood: {
    label: "생활권",
    layerIds: ["roads", "green-water", "transit", "population-admin", "population-100m", "business-stats", "live-poi", "medical"],
  },
  commercial: {
    label: "상권·활동",
    layerIds: ["business-stats", "employment", "floating-pop", "live-poi", "food-cafe", "convenience", "culture", "hotspot"],
  },
};
