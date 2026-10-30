import type { FilterSpecification } from "maplibre-gl";
import {
  classify, decimalsOf, fillByCode, format, INDICATOR_BY_VARIABLE, INDICATORS, legendItems, MEASURE, NO_VALUE,
  perThousand, unitOf, type Indicator,
} from "@/layers/providers/sgg-stats/choropleth";
import type { SggStatsResponse, SggStatsUnit } from "@/layers/providers/sgg-stats/server";
import type { LayerLegend, LayerStyle } from "@/layers/types";

// 2025 sigungu indicators on the 2025-12-31 lgu boundaries (code5 = the table's lgu_code,
// both MOIS).
const INDICATOR = "sgg-indicator";
const FILTER_2025: FilterSpecification = ["==", ["get", "d2025"], 1];

const indicatorOf = (selection: Record<string, string>) =>
  INDICATOR_BY_VARIABLE.get(selection[INDICATOR]) ?? INDICATOR_BY_VARIABLE.get("aged_share_65p")!;

function valueOf(unit: SggStatsUnit, indicator: Indicator, selection: Record<string, string>) {
  const value = unit.values[indicator.variable];
  if (value === null || value === undefined) return null;
  if (!perThousand(indicator, selection)) return value;
  const population = unit.values.pop_total;
  return population ? (value / population) * 1000 : null;
}

function scale(data: unknown, selection: Record<string, string>) {
  const response = data as SggStatsResponse | undefined;
  if (!response) return undefined;
  const indicator = indicatorOf(selection);
  const values = response.units.map((unit) => ({ unit, code5: unit.code5, value: valueOf(unit, indicator, selection) }));
  const present = values.flatMap(({ value }) => (value === null ? [] : [value]));
  return { indicator, values, present, classes: classify(present) };
}

export const style: LayerStyle = {
  order: 3,
  type: "fill",
  tiles: { provider: "region-layers", path: "lgu", sourceLayer: "lgu", minzoom: 4, maxzoom: 12 },
  featureKey: "code",
  filter: FILTER_2025,
  paint: { "fill-color": NO_VALUE, "fill-opacity": 0.7, "fill-outline-color": "rgba(40, 50, 70, 0.35)" },
  data: "2025",
  controls: [
    {
      key: INDICATOR,
      label: "지표",
      options: INDICATORS.map((item) => ({ value: item.variable, label: item.unit ? `${item.label} (${item.unit})` : item.label, group: item.group })),
      initial: "aged_share_65p",
    },
    MEASURE,
  ],
  apply: (selection, data) => {
    const current = scale(data, selection);
    if (!current || !current.present.length) return { filter: FILTER_2025, paint: { "fill-color": NO_VALUE } };
    return { filter: FILTER_2025, paint: { "fill-color": fillByCode(current.values, current.classes) } };
  },
  describe: (properties, selection, data) => {
    const current = scale(data, selection);
    const code5 = String(properties.code5);
    const entry = current?.values.find(({ unit }) => unit.code5 === code5);
    if (!current || !entry) return `${properties.name} · 2025 표에 없음`;
    const { indicator } = current;
    const label = `${indicator.label}${perThousand(indicator, selection) ? " (주민 1천 명당)" : ""}`;
    if (entry.value === null) return `${entry.unit.name} · ${label} 값 없음`;
    const rank = 1 + current.present.filter((value) => value > entry.value!).length;
    const unreliable = indicator.rseFlag && entry.unit.values[indicator.rseFlag] === 1 ? " · 상대표준오차 25% 이상(신뢰도 낮음)" : "";
    return `${entry.unit.name} · ${label} ${format(entry.value, decimalsOf(indicator, selection))} ${unitOf(indicator, selection)}`
      + ` · 전국 ${rank}/${current.present.length}위${unreliable} · ${indicator.source} ${indicator.reference}`;
  },
  legend: (selection, data): LayerLegend | undefined => {
    const current = scale(data, selection);
    if (!current || !current.present.length) return undefined;
    const { indicator, classes } = current;
    const items = legendItems(current.present, classes, decimalsOf(indicator, selection));
    const missing = current.values.length - current.present.length;
    return {
      title: `${indicator.label} (${unitOf(indicator, selection)})`,
      items: missing ? [...items, { color: NO_VALUE, label: `값 없음 ${missing}곳` }] : items,
      note: classes.diverging ? "0을 기준으로 음수·양수를 각각 중앙값에서 나눔" : "5분위(구간마다 약 46개 단위)",
    };
  },
};
