/**
 * Shared types for the Financial Visualization System. Everything here
 * describes shapes the visualization layer produces by aggregating/
 * filtering/comparing existing engine output — none of it is a new
 * financial calculation.
 */

export const TIME_RANGES = [
  "today",
  "yesterday",
  "7d",
  "30d",
  "90d",
  "6m",
  "1y",
  "all",
  "custom",
] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

export interface TimeRangeValue {
  range: TimeRange;
  /** "YYYY-MM-DD", only meaningful when range === "custom" */
  start?: string;
  /** "YYYY-MM-DD", only meaningful when range === "custom" */
  end?: string;
}

export const COMPARISON_MODES = [
  "none",
  "previous-period",
  "previous-month",
  "previous-year",
  "custom",
] as const;
export type ComparisonMode = (typeof COMPARISON_MODES)[number];

export interface ComparisonValue {
  mode: ComparisonMode;
  /** "YYYY-MM-DD", only meaningful when mode === "custom" */
  start?: string;
  /** "YYYY-MM-DD", only meaningful when mode === "custom" */
  end?: string;
}

export type Trend = "up" | "down" | "flat";

export interface PeriodComparison {
  current: number;
  previous: number;
  absoluteChange: number;
  /** null when previous === 0 (percentage change is undefined) */
  percentChange: number | null;
  trend: Trend;
}

export interface StatisticsSummary {
  count: number;
  mean: number;
  median: number;
  variance: number;
  stddev: number;
  min: number;
  max: number;
  /** Percent change from the first to the last value in the series. */
  growthRate: number | null;
}

export interface DateWindow {
  start: Date;
  end: Date;
}
