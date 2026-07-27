import type { FeedItem, FeedSeverity } from "@/types/feed";

/** Named per the scenarios in the spec rather than per FeedItemType, since
 * several types share a scenario (e.g. both "cash-flow-change" and a
 * critical "forecast-update" are a cash-flow risk). Exported so future
 * tuning never requires touching the scoring logic itself. */
export interface FeedPriorityWeights {
  criticalBudgetRisk: number;
  negativeCashFlow: number;
  upcomingSalary: number;
  upcomingSubscription: number;
  largeExpense: number;
  positiveSpendingTrend: number;
  achievement: number;
  generalInsight: number;
}

export const DEFAULT_FEED_PRIORITY_WEIGHTS: FeedPriorityWeights = {
  criticalBudgetRisk: 100,
  negativeCashFlow: 95,
  upcomingSalary: 80,
  upcomingSubscription: 75,
  largeExpense: 70,
  positiveSpendingTrend: 60,
  achievement: 50,
  generalInsight: 30,
};

const SEVERITY_MULTIPLIER: Record<FeedSeverity, number> = {
  critical: 1,
  important: 0.9,
  warning: 0.85,
  positive: 0.8,
  info: 0.75,
};

function baseWeightFor(item: FeedItem, weights: FeedPriorityWeights): number {
  switch (item.type) {
    case "budget-warning":
      return item.severity === "critical" ? weights.criticalBudgetRisk : weights.criticalBudgetRisk * 0.7;
    case "cash-flow-change":
      return item.severity === "critical" || item.severity === "warning"
        ? weights.negativeCashFlow
        : weights.positiveSpendingTrend;
    case "forecast-update":
      return item.severity === "critical" || item.severity === "warning"
        ? weights.negativeCashFlow * 0.9
        : weights.generalInsight;
    case "salary-expected":
      return weights.upcomingSalary;
    case "subscription-renewal":
      return weights.upcomingSubscription;
    case "large-expense":
      return weights.largeExpense;
    case "unusual-spending":
    case "category-trend":
      return weights.positiveSpendingTrend;
    case "achievement":
    case "savings-milestone":
    case "budget-recovered":
      return weights.achievement;
    case "merchant-insight":
    case "new-subscription":
    case "salary-received":
    case "recommendation":
    case "weekly-summary":
    case "monthly-summary":
    case "system-insight":
      return weights.generalInsight;
    default:
      return weights.generalInsight;
  }
}

/**
 * Deterministic priority scoring — the same item always produces the same
 * score. Pinned items always sort first regardless of score; ties within a
 * score break on recency. Pure TypeScript, no React, no LLM.
 */
export function prioritizeFeedItems(
  items: FeedItem[],
  weights: FeedPriorityWeights = DEFAULT_FEED_PRIORITY_WEIGHTS,
): FeedItem[] {
  const scored = items.map((item) => {
    const base = baseWeightFor(item, weights);
    const score = Math.round(base * SEVERITY_MULTIPLIER[item.severity] * item.confidence);
    return { ...item, priority: Math.min(100, Math.max(0, score)) };
  });

  return scored.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.createdAt.localeCompare(a.createdAt);
  });
}
