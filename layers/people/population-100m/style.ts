import type { ExpressionSpecification } from "maplibre-gl";
import type { LayerLegend, LayerStyle } from "@/layers/types";

// SGIS 100 m grid statistics: one selector picks the theme and year (attribute p2024, h2020 …).
// Population is pink-purple so it stays apart from the orange output-area population.
// Values are per 100 m cell, i.e. per hectare. SGIS protects small values, so a cell shows 0
// or at least 5 people; cells missing from a year's files are not drawn.
const KEY = "grid-100m";
const NO_VALUE = "#c9ccd1";

const THEMES = [
  { prefix: "p", label: "인구", unit: "명", years: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    steps: [1, 20, 50, 100, 200, 400, 800], colors: ["#fde0dd", "#fcc5c0", "#fa9fb5", "#f768a1", "#dd3497", "#ae017e", "#7a0177"] },
  { prefix: "h", label: "가구", unit: "가구", years: [2015, 2020, 2024],
    steps: [1, 10, 20, 50, 100, 200, 400], colors: ["#f7fcf5", "#d5efcf", "#a6dba0", "#6abf71", "#36a457", "#16823c", "#00592a"] },
  { prefix: "u", label: "주택", unit: "호", years: [2015, 2020, 2024],
    steps: [1, 10, 20, 50, 100, 200, 400], colors: ["#f7fbff", "#d3e4f3", "#a6cde4", "#6caed6", "#3c8dc4", "#1764ab", "#08427f"] },
  { prefix: "b", label: "사업체", unit: "개", years: [2015, 2020, 2024],
    steps: [1, 5, 10, 20, 50, 100, 300], colors: ["#fcfbfd", "#e5e3f0", "#c4c4e0", "#9e9ac8", "#7e72b4", "#62419c", "#45137f"] },
  { prefix: "w", label: "종사자", unit: "명", years: [2015, 2020, 2024],
    steps: [1, 10, 50, 100, 300, 1000, 3000], colors: ["#fff5f0", "#fdd3c0", "#fca486", "#fb7354", "#ef3c2c", "#c4161c", "#860811"] },
];

const themeOf = (selection: Record<string, string>) =>
  THEMES.find((theme) => theme.prefix === (selection[KEY] ?? "p2024")[0]) ?? THEMES[0];

const fillColor = (attribute: string, steps: number[], colors: string[]): ExpressionSpecification => [
  "step", ["get", attribute], NO_VALUE, ...steps.flatMap((min, i) => [min, colors[i]]),
];

const range = (steps: number[], i: number) =>
  i === steps.length - 1 ? `${steps[i].toLocaleString("ko-KR")} 이상` : `${steps[i].toLocaleString("ko-KR")}–${(steps[i + 1] - 1).toLocaleString("ko-KR")}`;

const legend = (selection: Record<string, string>): LayerLegend => {
  const theme = themeOf(selection);
  return {
    title: `${theme.label} (${theme.unit}/100m 격자)`,
    items: [...theme.steps.map((_, i) => ({ color: theme.colors[i], label: range(theme.steps, i) })), { color: NO_VALUE, label: "0" }],
    note: "SGIS 비밀보호로 작은 값은 5·8·13 등으로 바뀌어 있습니다. 격자 합계는 총조사보다 2% 안팎 큽니다. z11부터 보입니다.",
  };
};

export const style: LayerStyle = {
  order: 6,
  type: "fill",
  tiles: { path: "grid", sourceLayer: "grid", minzoom: 11, maxzoom: 14 },
  filter: ["has", "p2024"],
  featureKey: "cell",
  // Cell edges show from z13, where a cell is 10 px or more.
  paint: {
    "fill-color": fillColor("p2024", THEMES[0].steps, THEMES[0].colors), "fill-opacity": 0.6,
    "fill-outline-color": ["step", ["zoom"], "rgba(0, 0, 0, 0)", 13, "rgba(60, 20, 60, 0.35)"],
  },
  controls: [{
    key: KEY,
    label: "격자 지표",
    options: THEMES.flatMap((theme) =>
      [...theme.years].reverse().map((year) => ({ value: `${theme.prefix}${year}`, label: `${theme.label} ${year}년`, group: theme.label }))),
    initial: "p2024",
  }],
  apply: (selection) => {
    const attribute = selection[KEY];
    const theme = themeOf(selection);
    return { filter: ["has", attribute], paint: { "fill-color": fillColor(attribute, theme.steps, theme.colors) } };
  },
  // The cell's values for the chosen year, then every year of the chosen theme.
  describe: (properties, selection) => {
    const year = selection[KEY].slice(1);
    const count = (theme: (typeof THEMES)[number], y: number | string) => {
      const value = properties[`${theme.prefix}${y}`];
      return value === undefined ? undefined : `${Number(value).toLocaleString("ko-KR")}${theme.unit}`;
    };
    const values = THEMES.flatMap((theme) => {
      const value = count(theme, year);
      return value === undefined ? [] : [`${theme.label} ${value}`];
    });
    const theme = themeOf(selection);
    return [
      `격자 ${properties.cell} · ${year}년 ${values.join(" · ") || "값 없음"}`,
      `${theme.label} 연도별: ${theme.years.map((y) => `${y} ${count(theme, y) ?? "–"}`).join(" · ")}`,
    ];
  },
  legend,
};
