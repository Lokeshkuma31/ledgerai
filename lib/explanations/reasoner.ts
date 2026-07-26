import { computeCategoryMonthOverMonth } from "@/lib/explanations/evidence";
import { renderTemplate } from "@/lib/explanations/templates";
import type { BudgetStatus } from "@/types/budget";
import type { FinancialEvent, FinancialEventSeverity } from "@/types/event";
import type { CashFlowForecast } from "@/types/forecast";
import type { Insights } from "@/lib/insights/engine";
import type { TimelineGroup } from "@/lib/timeline/engine";
import type { IndexedObject } from "@/types/index";
import type { MerchantProfile } from "@/types/merchant-profile";
import type { QueryResult } from "@/types/query";
import type { Recommendation, RecommendationPriority } from "@/types/recommendation";
import type { RecurringTransaction } from "@/types/recurring";
import type { Transaction } from "@/types/transaction";

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export interface ReasonResult {
  reason: string;
  confidence: number;
}

/**
 * Deterministic — no LLM, no randomness. Every branch here maps existing,
 * already-computed engine output onto a template; nothing recalculates a
 * financial figure. Confidence scales with how much data backs the
 * observation (transaction volume, engine-reported confidence, etc.),
 * never a subjective guess.
 */
export function reasonForBudget(status: BudgetStatus, transactions: Transaction[], now: Date): ReasonResult {
  const percentage = `${Math.round(status.percentageUsed)}%`;
  const values = {
    category: status.category,
    budget: formatAmount(status.monthlyLimit),
    percentage,
    days: String(status.daysRemainingThisMonth),
  };

  if (status.status === "exceeded") {
    return { reason: renderTemplate("budget-exceeded", values), confidence: 0.98 };
  }
  if (status.status === "warning") {
    const trend = computeCategoryMonthOverMonth(transactions, status.category, now);
    const trendLabel =
      trend.percentageChange === null
        ? "higher than usual"
        : `${trend.percentageChange >= 0 ? "up" : "down"} ${Math.round(Math.abs(trend.percentageChange) * 100)}%`;
    return {
      reason: renderTemplate("budget-warning", { ...values, trend: trendLabel }),
      confidence: 0.9,
    };
  }
  return {
    reason: renderTemplate("budget-safe", values),
    confidence: status.transactionCount >= 3 ? 0.95 : 0.75,
  };
}

export function reasonForForecast(forecast: CashFlowForecast, recurring: RecurringTransaction[]): ReasonResult {
  const recurringExpenseTotal = recurring
    .filter((r) => r.isExpense && r.frequency === "Monthly")
    .reduce((sum, r) => sum + r.averageAmount, 0);

  return {
    reason: renderTemplate("forecast-reason", {
      forecast: formatAmount(recurringExpenseTotal),
      amount: `${formatAmount(forecast.dailySafeSpend)}/day`,
      balance: formatAmount(forecast.projectedEndOfMonthBalance),
    }),
    confidence: forecast.confidence,
  };
}

const PRIORITY_CONFIDENCE: Record<RecommendationPriority, number> = {
  critical: 0.95,
  high: 0.85,
  medium: 0.7,
  low: 0.5,
};

export function reasonForRecommendation(recommendation: Recommendation): ReasonResult {
  return {
    reason: renderTemplate("recommendation-reason", { reason: recommendation.reason }),
    confidence: PRIORITY_CONFIDENCE[recommendation.priority],
  };
}

export function reasonForRecurringTransaction(item: RecurringTransaction): ReasonResult {
  const merchant = item.merchantName ?? item.title;
  if (item.status === "Missed" && item.nextExpectedOccurrence) {
    return {
      reason: renderTemplate("recurring-missed", { merchant, date: item.nextExpectedOccurrence }),
      confidence: item.confidence,
    };
  }
  if (item.status === "Upcoming" && item.nextExpectedOccurrence) {
    return {
      reason: renderTemplate("recurring-upcoming", {
        merchant,
        date: item.nextExpectedOccurrence,
        frequency: item.frequency.toLowerCase(),
      }),
      confidence: item.confidence,
    };
  }
  return {
    reason: renderTemplate("recurring-consistent", {
      merchant,
      frequency: item.frequency.toLowerCase(),
      count: String(item.transactionCount),
    }),
    confidence: item.confidence,
  };
}

const SEVERITY_CONFIDENCE: Record<FinancialEventSeverity, number> = {
  critical: 0.95,
  important: 0.85,
  warning: 0.75,
  info: 0.6,
};

export function reasonForFinancialEvent(event: FinancialEvent): ReasonResult {
  return {
    reason: renderTemplate("event-reason", { reason: event.description }),
    confidence: SEVERITY_CONFIDENCE[event.severity],
  };
}

export function reasonForMerchantProfile(profile: MerchantProfile): ReasonResult {
  return {
    reason: renderTemplate("merchant-profile-reason", {
      merchant: profile.canonicalName,
      amount: formatAmount(profile.totalSpend),
      count: String(profile.transactionCount),
      category: profile.defaultCategory,
    }),
    confidence: profile.confidence,
  };
}

export function reasonForInsights(insights: Insights): ReasonResult {
  const top = insights.categoryBreakdown[0];
  if (!top) {
    return { reason: "Not enough transactions yet to identify a spending pattern.", confidence: 0.5 };
  }
  return {
    reason: renderTemplate("insights-reason", {
      category: top.category,
      percentage: `${Math.round(top.percentage)}%`,
      count: String(insights.totalTransactions),
    }),
    confidence: insights.totalTransactions >= 10 ? 0.95 : 0.7,
  };
}

export function reasonForTimelineSummary(group: TimelineGroup): ReasonResult {
  return {
    reason: renderTemplate("timeline-reason", {
      count: String(group.transactionCount),
      amount: formatAmount(group.totalAmount),
      date: group.label,
    }),
    confidence: 1,
  };
}

export function reasonForSearchResult(item: IndexedObject): ReasonResult {
  const matchedOn = item.merchant ?? item.category ?? item.type;
  return {
    reason: renderTemplate("search-result-reason", { category: item.type, trend: matchedOn }),
    confidence: item.merchant || item.category ? 0.9 : 0.7,
  };
}

export function reasonForQueryResponse(result: QueryResult): ReasonResult {
  const note =
    result.intent === "unknown"
      ? "The question could not be matched to a specific intent, so this may be incomplete."
      : "";
  return {
    reason: renderTemplate("query-response-reason", { category: result.intent, trend: note }),
    confidence: result.intent === "unknown" ? 0.4 : 0.9,
  };
}
