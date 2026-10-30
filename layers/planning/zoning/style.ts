import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl";
import type { LayerLegend, LayerStyle } from "@/layers/types";

// Nationwide 용도지역 from VWorld (one tile layer, `kind` = urban | management | agri | conservation | gb).
// One selector switches between the 21 detailed zones, the four broad zones and 개발제한구역.
// `rank` sorts the blank, 기타 and 미분류 polygons (mostly outer 도시지역 extents) under the detailed zones.
const KEY = "zoning-view";
const OTHER = "#d4d4d8";

const ZONES: { group: string; items: [string, string][] }[] = [
  { group: "주거", items: [
    ["제1종전용주거지역", "#fff6bf"], ["제2종전용주거지역", "#ffee99"], ["제1종일반주거지역", "#ffe066"],
    ["제2종일반주거지역", "#fdd23b"], ["제3종일반주거지역", "#f9b81b"], ["준주거지역", "#f08c1a"]] },
  { group: "상업", items: [
    ["중심상업지역", "#b0124f"], ["일반상업지역", "#e04a6a"], ["근린상업지역", "#f48ca0"], ["유통상업지역", "#c86fae"]] },
  { group: "공업", items: [["전용공업지역", "#4c3d91"], ["일반공업지역", "#7d6fc4"], ["준공업지역", "#b6abe6"]] },
  { group: "녹지", items: [["보전녹지지역", "#2f7d3b"], ["생산녹지지역", "#86bf57"], ["자연녹지지역", "#a9dba0"]] },
  { group: "관리", items: [["계획관리지역", "#e8cf9c"], ["생산관리지역", "#d3b877"], ["보전관리지역", "#b7a46e"]] },
  { group: "농림·보전", items: [["농림지역", "#d6eabd"], ["자연환경보전지역", "#6fbfae"]] },
];

const KINDS: [string, string, string][] = [
  ["urban", "도시지역", "#f2b84b"], ["management", "관리지역", "#d3b877"],
  ["agri", "농림지역", "#b9dc97"], ["conservation", "자연환경보전지역", "#4fae9b"],
];
const GB_COLOR = "#5f7f2a";

const match = (attribute: string, pairs: string[]) => ["match", ["get", attribute], ...pairs, OTHER] as unknown as ExpressionSpecification;
const detailColor = match("name", ZONES.flatMap((z) => z.items.flat()));
const kindColor = match("kind", KINDS.flatMap(([kind, , color]) => [kind, color]));

const VIEWS: Record<string, { filter: FilterSpecification; color: ExpressionSpecification | string }> = {
  detail: { filter: ["!=", ["get", "kind"], "gb"], color: detailColor },
  kind: { filter: ["!=", ["get", "kind"], "gb"], color: kindColor },
  gb: { filter: ["==", ["get", "kind"], "gb"], color: GB_COLOR },
};

const legend = (selection: Record<string, string>): LayerLegend => {
  const view = selection[KEY] ?? "detail";
  const note = "국토교통부 용도지역지구정보(VWorld, 2026-10-30). 법적 효력이 없는 참고 정보입니다. z9부터 보입니다.";
  if (view === "gb") return { title: "개발제한구역", items: [{ color: GB_COLOR, label: "개발제한구역" }], note };
  if (view === "kind") return { title: "용도지역 대분류", items: KINDS.map(([, label, color]) => ({ color, label })), note };
  return {
    title: "용도지역",
    items: [...ZONES.flatMap((z) => z.items.map(([label, color]) => ({ color, label }))), { color: OTHER, label: "미분류·기타" }],
    note,
  };
};

const KIND_LABEL = Object.fromEntries([...KINDS.map(([kind, label]) => [kind, label]), ["gb", "개발제한구역"]]);

export const style: LayerStyle = {
  order: 2,
  type: "fill",
  tiles: { path: "zoning", sourceLayer: "zoning", minzoom: 9, maxzoom: 14 },
  filter: VIEWS.detail.filter,
  featureKey: "zid",
  // Zone edges show from z13.
  layout: { "fill-sort-key": ["get", "rank"] },
  paint: {
    "fill-color": detailColor, "fill-opacity": 0.55,
    "fill-outline-color": ["step", ["zoom"], "rgba(0, 0, 0, 0)", 13, "rgba(60, 60, 60, 0.35)"],
  },
  controls: [{
    key: KEY,
    label: "용도지역 보기",
    options: [
      { value: "detail", label: "용도지역 21종" },
      { value: "kind", label: "대분류 4종" },
      { value: "gb", label: "개발제한구역" },
    ],
    initial: "detail",
  }],
  apply: (selection) => {
    const view = VIEWS[selection[KEY]] ?? VIEWS.detail;
    return { filter: view.filter, paint: { "fill-color": view.color } };
  },
  describe: (properties) => {
    const notice = properties.dyear && properties.dyear !== "0000" ? ` · 고시 ${properties.dyear}년 제${properties.dnum}호` : "";
    return [
      `${properties.name} (${KIND_LABEL[String(properties.kind)] ?? properties.kind})${notice}`,
      `${properties.sido_name ?? ""} ${properties.sigg_name ?? ""}`.trim(),
    ];
  },
  legend,
};
