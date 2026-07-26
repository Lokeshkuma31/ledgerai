import type { ForecastRiskLevel } from "@/types/forecast";

const WATCH_THRESHOLD = 90;
const HIGH_RISK_THRESHOLD = 105;
const CRITICAL_THRESHOLD = 120;

/**
 * Deterministic risk classification from a projected budget-utilization
 * percentage. A category with no budget configured (null) is always
 * "Safe" — there's nothing to overrun.
 */
export function classifyRisk(projectedPercentageUsed: number | null): ForecastRiskLevel {
  if (projectedPercentageUsed === null) return "Safe";
  if (projectedPercentageUsed >= CRITICAL_THRESHOLD) return "Critical";
  if (projectedPercentageUsed >= HIGH_RISK_THRESHOLD) return "High Risk";
  if (projectedPercentageUsed >= WATCH_THRESHOLD) return "Watch";
  return "Safe";
}
