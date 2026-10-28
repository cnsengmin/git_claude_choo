import type { ExpressionSpecification } from "maplibre-gl";
import type { LayerStyle } from "@/layers/types";

// Persons per km² of the output area. Output areas are drawn to hold similar populations, so
// density, not the count, tells them apart.
const STEPS = [
  { min: 0, color: "#fff5eb", label: "100 미만" },
  { min: 100, color: "#fdd8b3", label: "100–1천" },
  { min: 1000, color: "#fdae6b", label: "1천–5천" },
  { min: 5000, color: "#f98b3a", label: "5천–1만" },
  { min: 10000, color: "#e6550d", label: "1만–2만" },
  { min: 20000, color: "#c03d02", label: "2만–4만" },
  { min: 40000, color: "#8c2d04", label: "4만 이상" },
];
const NO_VALUE = "#c9ccd1";
const YEARS = ["2015", "2020", "2024"];

const fillColor = (year: string): ExpressionSpecification => [
  "case",
  ["has", `dn${year}`],
  ["step", ["get", `dn${year}`], STEPS[0].color, ...STEPS.slice(1).flatMap((step) => [step.min, step.color])],
  NO_VALUE,
];

export const style: LayerStyle = {
  order: 5,
  type: "fill",
  tiles: { path: "oa", sourceLayer: "oa", minzoom: 10, maxzoom: 14 },
  paint: { "fill-color": fillColor("2024"), "fill-opacity": 0.55, "fill-outline-color": "rgba(120, 60, 20, 0.25)" },
  time: {
    key: "oa-year",
    label: "인구 연도",
    options: YEARS.map((year) => ({ value: year, label: `${year}년` })),
    initial: "2024",
    apply: (year) => ({ paint: { "fill-color": fillColor(year) } }),
  },
  describe: (properties, year = "2024") => {
    const { oa_cd, adm_nm } = properties as Record<string, string>;
    const people = properties[`p${year}`];
    const density = properties[`dn${year}`];
    const value = people === undefined
      ? "값 없음(N/A)"
      : `${Number(people).toLocaleString("ko-KR")}명 · ${Number(density).toLocaleString("ko-KR")}명/㎢`;
    return `집계구 ${oa_cd} (${adm_nm}) · ${year}년 ${value}`;
  },
  legend: {
    title: "인구밀도 (명/㎢)",
    items: [...STEPS.map((step) => ({ color: step.color, label: step.label })), { color: NO_VALUE, label: "값 없음(N/A)" }],
  },
};
