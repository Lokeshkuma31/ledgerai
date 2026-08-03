import type { PeriodComparison, Trend } from "./types";

const FLAT_EPSILON = 0.0001;

function resolveTrend(absoluteChange: number): Trend {
  if (Math.abs(absoluteChange) < FLAT_EPSILON) return "flat";
  return absoluteChange > 0 ? "up" : "down";
}

/**
 * Compares two already-computed totals (e.g. this period's spend vs. the
 * preceding period's spend). Never recomputes either total itself.
 */
export function comparePeriods(current: number, previous: number): PeriodComparison {
  const absoluteChange = current - previous;
  const percentChange = previous === 0 ? null : (absoluteChange / Math.abs(previous)) * 100;
  return {
    current,
    previous,
    absoluteChange,
    percentChange,
    trend: resolveTrend(absoluteChange),
  };
}
