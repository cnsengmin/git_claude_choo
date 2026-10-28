import type { ExpressionSpecification } from "maplibre-gl";
import indicators from "@/layers/people/sgg-stats-2025/indicators.json";

// Class breaks and colours shared by the sigungu statistics layers (client-safe).

export type Indicator = {
  variable: string;
  label: string;
  unit: string;
  kind: string;
  group: string;
  source: string;
  reference: string;
  rseFlag?: string;
};

// From the 2025 codebook (scripts/sgg2025/build_layer_indicators.py); the panel uses the same
// variable names.
export const INDICATORS = indicators as Indicator[];
export const INDICATOR_BY_VARIABLE = new Map(INDICATORS.map((item) => [item.variable, item]));

export const SEQUENTIAL = ["#f1eef6", "#bdc9e1", "#74a9cf", "#2b8cbe", "#045a8d"];
// Strong negative, weak negative, weak positive, strong positive.
export const DIVERGING = ["#b2182b", "#ef8a62", "#67a9cf", "#2166ac"];
export const NO_VALUE = "#c9ccd1";

// Counts grow with the unit's size; per 1,000 registered residents makes units comparable.
export const MEASURE = {
  key: "sgg-measure",
  label: "표시",
  options: [
    { value: "value", label: "값 그대로" },
    { value: "per1000", label: "주민 1천 명당 (수 지표만)" },
  ],
  initial: "value",
};

export const perThousand = (indicator: Indicator, selection: Record<string, string>) =>
  indicator.kind === "count" && selection[MEASURE.key] === "per1000";

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

export type Classes = { breaks: number[]; colors: string[]; diverging: boolean };

// Quintiles, or, when values change sign (net migration), negatives and positives each split
// at their median around 0.
export function classify(values: number[]): Classes {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted[0] < 0 && sorted[sorted.length - 1] > 0) {
    const negative = sorted.filter((value) => value < 0);
    const positive = sorted.filter((value) => value >= 0);
    return { breaks: [quantile(negative, 0.5), 0, quantile(positive, 0.5)], colors: DIVERGING, diverging: true };
  }
  const breaks = [...new Set([0.2, 0.4, 0.6, 0.8].map((q) => quantile(sorted, q)))];
  return { breaks, colors: SEQUENTIAL.slice(SEQUENTIAL.length - breaks.length - 1), diverging: false };
}

export const classOf = (value: number, breaks: number[]) => breaks.filter((limit) => value >= limit).length;

// Fill colour by code5 for the units that have a value; the rest stay grey.
export function fillByCode(values: { code5: string; value: number | null }[], classes: Classes): ExpressionSpecification {
  const pairs = values.flatMap(({ code5, value }) => (value === null ? [] : [code5, classes.colors[classOf(value, classes.breaks)]]));
  return (pairs.length ? ["match", ["get", "code5"], ...pairs, NO_VALUE] : ["literal", NO_VALUE]) as unknown as ExpressionSpecification;
}

export const format = (value: number, decimals: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: decimals });
export const decimalsOf = (indicator: Indicator, selection: Record<string, string>) =>
  (perThousand(indicator, selection) || indicator.kind !== "count" ? 2 : 0);
export const unitOf = (indicator: Indicator, selection: Record<string, string>) =>
  (perThousand(indicator, selection) ? `${indicator.unit}/주민 1천 명` : indicator.unit);

export function legendItems(present: number[], classes: Classes, decimals: number) {
  const bounds = [Math.min(...present), ...classes.breaks, Math.max(...present)];
  return classes.colors.map((color, index) => ({
    color,
    label: `${format(bounds[index], decimals)} – ${format(bounds[index + 1], decimals)}`,
  }));
}
