import type { FilterSpecification } from "maplibre-gl";
import {
  classify, decimalsOf, fillByCode, format, INDICATOR_BY_VARIABLE, legendItems, MEASURE, NO_VALUE, perThousand,
  unitOf, type Indicator,
} from "@/layers/providers/sgg-stats/choropleth";
import type { SggPanelResponse, SggPanelUnit } from "@/layers/providers/sgg-stats/server";
import type { LayerLegend, LayerStyle } from "@/layers/types";

// 2008-2025 sigungu panel (data/derived/sgg-panel) on the 2025-12-31 lgu boundaries: earlier
// years were moved to these units with the crosswalk, so one unit is the same area every year.
const INDICATOR = "panel-indicator";
const YEAR = "panel-year";
const SCALE = "panel-scale";
const FILTER_2025: FilterSpecification = ["==", ["get", "d2025"], 1];
// Variables and first year (scripts/sgg_panel/collect_kosis_panel.py SERIES).
const PANEL: [string, number][] = [
  ["pop_total", 2011], ["households_rr", 2011],
  ["migr_in", 2008], ["migr_out", 2008], ["migr_net", 2008],
  ["births", 2008], ["deaths", 2008],
  ["census_pop", 2015], ["census_foreigners", 2015], ["census_households", 2015], ["housing_total", 2015],
];
const FIRST_YEAR = new Map(PANEL);
const YEARS = Array.from({ length: 2025 - 2008 + 1 }, (_, index) => String(2008 + index));

const indicatorOf = (selection: Record<string, string>) =>
  INDICATOR_BY_VARIABLE.get(selection[INDICATOR]) ?? INDICATOR_BY_VARIABLE.get("pop_total")!;

function valueAt(unit: SggPanelUnit, index: number, indicator: Indicator, selection: Record<string, string>) {
  const value = unit.values[indicator.variable]?.[index];
  if (value === null || value === undefined) return null;
  if (!perThousand(indicator, selection)) return value;
  const population = unit.values.pop_total?.[index];
  return population ? (value / population) * 1000 : null;
}

function scale(data: unknown, selection: Record<string, string>) {
  const response = data as SggPanelResponse | undefined;
  if (!response) return undefined;
  const indicator = indicatorOf(selection);
  const index = response.years.indexOf(Number(selection[YEAR]));
  const values = response.units.map((unit) => ({ unit, code5: unit.code5, value: index < 0 ? null : valueAt(unit, index, indicator, selection) }));
  const present = values.flatMap(({ value }) => (value === null ? [] : [value]));
  // Common classes pool every year so colours compare across years; yearly ones use the year alone.
  const pool = selection[SCALE] === "year"
    ? present
    : response.units.flatMap((unit) => response.years.flatMap((_, i) => {
      const value = valueAt(unit, i, indicator, selection);
      return value === null ? [] : [value];
    }));
  return { response, indicator, index, values, present, pool, classes: pool.length ? classify(pool) : undefined };
}

const signed = (value: number, decimals: number) => `${value > 0 ? "+" : ""}${format(value, decimals)}`;

export const style: LayerStyle = {
  order: 2,
  type: "fill",
  tiles: { provider: "region-layers", path: "lgu", sourceLayer: "lgu", minzoom: 4, maxzoom: 12 },
  featureKey: "code",
  filter: FILTER_2025,
  paint: { "fill-color": NO_VALUE, "fill-opacity": 0.7, "fill-outline-color": "rgba(40, 50, 70, 0.35)" },
  data: "panel",
  controls: [
    {
      key: INDICATOR,
      label: "지표",
      options: PANEL.map(([variable, first]) => {
        const item = INDICATOR_BY_VARIABLE.get(variable)!;
        return { value: variable, label: `${item.label} (${item.unit}) · ${first}–2025`, group: item.group };
      }),
      initial: "pop_total",
    },
    { key: YEAR, label: "연도", options: YEARS.map((year) => ({ value: year, label: `${year}년` })), initial: "2025" },
    MEASURE,
    {
      key: SCALE,
      label: "색 구간",
      options: [
        { value: "all", label: "모든 연도 공통 (연도 비교)" },
        { value: "year", label: "그해만" },
      ],
      initial: "all",
    },
  ],
  apply: (selection, data) => {
    const current = scale(data, selection);
    if (!current?.classes || !current.present.length) return { filter: FILTER_2025, paint: { "fill-color": NO_VALUE } };
    return { filter: FILTER_2025, paint: { "fill-color": fillByCode(current.values, current.classes) } };
  },
  describe: (properties, selection, data) => {
    const current = scale(data, selection);
    const entry = current?.values.find(({ code5 }) => code5 === String(properties.code5));
    if (!current || !entry) return `${properties.name} · 시계열에 없음`;
    const { indicator, index, response } = current;
    const year = Number(selection[YEAR]);
    const label = `${indicator.label}${perThousand(indicator, selection) ? " (주민 1천 명당)" : ""}`;
    if (entry.value === null) {
      const first = FIRST_YEAR.get(indicator.variable) ?? 2008;
      const why = year < first ? `이 지표는 ${first}년부터` : perThousand(indicator, selection) ? "주민등록인구는 2011년부터" : "값 없음";
      return `${entry.unit.name} · ${label} ${year}년 값 없음 (${why})`;
    }
    const decimals = decimalsOf(indicator, selection);
    const unit = unitOf(indicator, selection);
    const previous = index > 0 ? valueAt(entry.unit, index - 1, indicator, selection) : null;
    const firstIndex = response.years.findIndex((_, i) => valueAt(entry.unit, i, indicator, selection) !== null);
    const first = firstIndex >= 0 && firstIndex < index ? valueAt(entry.unit, firstIndex, indicator, selection) : null;
    const change = previous === null ? "" : ` · 전년 대비 ${signed(entry.value - previous, decimals)}`
      + (previous ? ` (${signed(((entry.value - previous) / Math.abs(previous)) * 100, 1)}%)` : "");
    const since = first === null ? "" : ` · ${response.years[firstIndex]}년 대비 ${signed(entry.value - first, decimals)}`;
    const alloc = entry.unit.alloc[index] > 0
      ? ` · 경계 변경 전 값을 인구 몫으로 배분(${format(entry.unit.alloc[index] * 100, 1)}%)` : "";
    return `${entry.unit.name} · ${label} ${year}년 ${format(entry.value, decimals)} ${unit}${change}${since}${alloc}`;
  },
  legend: (selection, data): LayerLegend | undefined => {
    const current = scale(data, selection);
    if (!current?.classes || !current.pool.length) return undefined;
    const { indicator, classes } = current;
    const items = legendItems(current.pool, classes, decimalsOf(indicator, selection));
    const missing = current.values.length - current.present.length;
    const basis = selection[SCALE] === "year" ? "그해 값만으로" : "2008–2025 모든 연도를 합쳐";
    return {
      title: `${indicator.label} (${unitOf(indicator, selection)}) · ${selection[YEAR]}년`,
      items: missing ? [...items, { color: NO_VALUE, label: `값 없음 ${missing}곳` }] : items,
      note: `${basis} ${classes.diverging ? "0을 기준으로 음수·양수를 각각 중앙값에서 나눔" : "5분위"}. 2025 경계로 맞춘 값`,
    };
  },
};
