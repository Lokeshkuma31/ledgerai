/**
 * Generic numeric statistics — pure math, no domain knowledge of budgets,
 * forecasts, or categories. Charts pass already-aggregated numbers (e.g. a
 * MonthlyCashFlow series's `expense` values) into these; nothing here
 * re-derives what those numbers mean.
 */

import type { StatisticsSummary } from "./types";

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  return mean(values.map((v) => (v - avg) ** 2));
}

export function stddev(values: number[]): number {
  return Math.sqrt(variance(values));
}

/** `p` in [0, 100]. Linear interpolation between closest ranks. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/** Trailing simple moving average, windowed. Returns one value per input index (fewer than `window` prior points just average what's available). */
export function movingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    return mean(values.slice(start, i + 1));
  });
}

/** Percent change from the first to the last value. Null when the series has fewer than 2 points or starts at 0 (undefined percentage). */
export function growthRate(values: number[]): number | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return null;
  return ((last - first) / Math.abs(first)) * 100;
}

export interface HighestLowestAverage {
  highest: number;
  lowest: number;
  average: number;
}

export function highestLowestAverage(values: number[]): HighestLowestAverage {
  if (values.length === 0) return { highest: 0, lowest: 0, average: 0 };
  return {
    highest: Math.max(...values),
    lowest: Math.min(...values),
    average: mean(values),
  };
}

export function summarizeStatistics(values: number[]): StatisticsSummary {
  const { highest, lowest } = highestLowestAverage(values);
  return {
    count: values.length,
    mean: mean(values),
    median: median(values),
    variance: variance(values),
    stddev: stddev(values),
    min: values.length ? lowest : 0,
    max: values.length ? highest : 0,
    growthRate: growthRate(values),
  };
}
