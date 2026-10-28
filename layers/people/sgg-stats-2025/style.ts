import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl";
import type { SggStatsResponse, SggStatsUnit } from "@/layers/providers/sgg-stats/server";
import type { LayerLegend, LayerStyle } from "@/layers/types";
import indicators from "./indicators.json";

// 2025 sigungu indicators on the 2025-12-31 lgu boundaries (code5 = the table's lgu_code,
// both MOIS). indicators.json comes from the codebook (scripts/sgg2025/build_layer_indicators.py).
type Indicator = {
  variable: string;
  label: string;
  unit: string;
  kind: string;
  group: string;
  source: string;
  reference: string;
  rseFlag?: string;
};

const INDICATORS = indicators as Indicator[];
const BY_VARIABLE = new Map(INDICATORS.map((item) => [item.variable, item]));
const INDICATOR = "sgg-indicator";
const MEASURE = "sgg-measure";
const SEQUENTIAL = ["#f1eef6", "#bdc9e1", "#74a9cf", "#2b8cbe", "#045a8d"];
// Strong negative, weak negative, weak positive, strong positive.
const DIVERGING = ["#b2182b", "#ef8a62", "#67a9cf", "#2166ac"];
const NO_VALUE = "#c9ccd1";
const FILTER_2025: FilterSpecification = ["==", ["get", "d2025"], 1];

const indicatorOf = (selection: Record<string, string>) => BY_VARIABLE.get(selection[INDICATOR]) ?? BY_VARIABLE.get("aged_share_65p")!;
// Counts grow with the unit's size; per 1,000 registered residents makes units comparable.
const perThousand = (indicator: Indicator, selection: Record<string, string>) => indicator.kind === "count" && selection[MEASURE] === "per1000";

function valueOf(unit: SggStatsUnit, indicator: Indicator, selection: Record<string, string>) {
  const value = unit.values[indicator.variable];
  if (value === null || value === undefined) return null;
  if (!perThousand(indicator, selection)) return value;
  const population = unit.values.pop_total;
  return population ? (value / population) * 1000 : null;
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

// Quintiles, or, when values change sign (net migration), negatives and positives each split
// at their median around 0.
function classify(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted[0] < 0 && sorted[sorted.length - 1] > 0) {
    const negative = sorted.filter((value) => value < 0);
    const positive = sorted.filter((value) => value >= 0);
    return { breaks: [quantile(negative, 0.5), 0, quantile(positive, 0.5)], colors: DIVERGING, diverging: true };
  }
  const breaks = [...new Set([0.2, 0.4, 0.6, 0.8].map((q) => quantile(sorted, q)))];
  return { breaks, colors: SEQUENTIAL.slice(SEQUENTIAL.length - breaks.length - 1), diverging: false };
}

const classOf = (value: number, breaks: number[]) => breaks.filter((limit) => value >= limit).length;

const format = (value: number, decimals: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: decimals });
const decimalsOf = (indicator: Indicator, selection: Record<string, string>) => (perThousand(indicator, selection) || indicator.kind !== "count" ? 2 : 0);
const unitOf = (indicator: Indicator, selection: Record<string, string>) => (perThousand(indicator, selection) ? `${indicator.unit}/주민 1천 명` : indicator.unit);

function scale(data: unknown, selection: Record<string, string>) {
  const response = data as SggStatsResponse | undefined;
  if (!response) return undefined;
  const indicator = indicatorOf(selection);
  const values = response.units.map((unit) => ({ unit, value: valueOf(unit, indicator, selection) }));
  const present = values.flatMap(({ value }) => (value === null ? [] : [value]));
  return { indicator, values, present, ...classify(present) };
}

export const style: LayerStyle = {
  order: 3,
  type: "fill",
  tiles: { provider: "region-layers", path: "lgu", sourceLayer: "lgu", minzoom: 4, maxzoom: 12 },
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
    {
      key: MEASURE,
      label: "표시",
      options: [
        { value: "value", label: "값 그대로" },
        { value: "per1000", label: "주민 1천 명당 (수 지표만)" },
      ],
      initial: "value",
    },
  ],
  apply: (selection, data) => {
    const current = scale(data, selection);
    if (!current || !current.present.length) return { filter: FILTER_2025, paint: { "fill-color": NO_VALUE } };
    const pairs = current.values.flatMap(({ unit, value }) => (value === null ? [] : [unit.code5, current.colors[classOf(value, current.breaks)]]));
    const color = ["match", ["get", "code5"], ...pairs, NO_VALUE] as unknown as ExpressionSpecification;
    return { filter: FILTER_2025, paint: { "fill-color": color } };
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
    const { indicator, breaks, colors, diverging } = current;
    const decimals = decimalsOf(indicator, selection);
    const bounds = [Math.min(...current.present), ...breaks, Math.max(...current.present)];
    const items = colors.map((color, index) => ({
      color,
      label: `${format(bounds[index], decimals)} – ${format(bounds[index + 1], decimals)}`,
    }));
    const missing = current.values.length - current.present.length;
    return {
      title: `${indicator.label} (${unitOf(indicator, selection)})`,
      items: missing ? [...items, { color: NO_VALUE, label: `값 없음 ${missing}곳` }] : items,
      note: diverging ? "0을 기준으로 음수·양수를 각각 중앙값에서 나눔" : "5분위(구간마다 약 46개 단위)",
    };
  },
};
