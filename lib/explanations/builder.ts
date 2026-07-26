import {
  evidenceForBudget,
  evidenceForFinancialEvent,
  evidenceForForecast,
  evidenceForInsights,
  evidenceForMerchantProfile,
  evidenceForQueryResponse,
  evidenceForRecommendation,
  evidenceForRecurringTransaction,
  evidenceForSearchResult,
  evidenceForTimelineSummary,
  findReferencedCategory,
} from "@/lib/explanations/evidence";
import {
  reasonForBudget,
  reasonForFinancialEvent,
  reasonForForecast,
  reasonForInsights,
  reasonForMerchantProfile,
  reasonForQueryResponse,
  reasonForRecommendation,
  reasonForRecurringTransaction,
  reasonForSearchResult,
  reasonForTimelineSummary,
} from "@/lib/explanations/reasoner";
import type { BudgetStatus } from "@/types/budget";
import type { Explanation, ExplanationContext } from "@/types/explanation";
import type { FinancialEvent } from "@/types/event";
import type { CashFlowForecast } from "@/types/forecast";
import type { Insights } from "@/lib/insights/engine";
import type { TimelineGroup } from "@/lib/timeline/engine";
import type { IndexedObject } from "@/types/index";
import type { MerchantProfile } from "@/types/merchant-profile";
import type { QueryResult } from "@/types/query";
import type { Recommendation } from "@/types/recommendation";
import type { RecurringTransaction } from "@/types/recurring";

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function draft(
  objectType: Explanation["objectType"],
  objectId: string,
  fields: Omit<Explanation, "id" | "objectType" | "objectId" | "generatedAt" | "lastUpdated">,
  now: Date,
): Explanation {
  const timestamp = now.toISOString();
  return {
    id: `${objectType}:${objectId}`,
    objectType,
    objectId,
    generatedAt: timestamp,
    lastUpdated: timestamp,
    ...fields,
  };
}

export function buildBudgetExplanation(status: BudgetStatus, context: ExplanationContext): Explanation {
  const { reason, confidence } = reasonForBudget(status, context.transactions, context.now);
  return draft(
    "budget",
    status.id,
    {
      title: `${status.category} Budget`,
      summary: `${formatAmount(status.currentSpend)} of ${formatAmount(status.monthlyLimit)} used (${Math.round(status.percentageUsed)}%)`,
      reason,
      supportingEvidence: evidenceForBudget(status, context.transactions, context.now),
      confidence,
      tags: [status.status],
      relatedObjects: [{ type: "category", id: status.category, label: status.category }],
    },
    context.now,
  );
}

export function buildForecastExplanation(forecast: CashFlowForecast, context: ExplanationContext): Explanation {
  const { reason, confidence } = reasonForForecast(forecast, context.recurring);
  const atRiskCategories = forecast.categoryProjections.filter(
    (c) => c.riskLevel === "Watch" || c.riskLevel === "High Risk" || c.riskLevel === "Critical",
  );
  return draft(
    "forecast",
    "forecast:overall",
    {
      title: "Cash Flow Forecast",
      summary: `Projected month-end balance ${formatAmount(forecast.projectedEndOfMonthBalance)}`,
      reason,
      supportingEvidence: evidenceForForecast(forecast, context.recurring),
      confidence,
      tags: atRiskCategories.length > 0 ? ["at-risk"] : ["on-track"],
      relatedObjects: atRiskCategories.map((c) => ({ type: "category", id: c.category, label: c.category })),
    },
    context.now,
  );
}

export function buildRecommendationExplanation(
  recommendation: Recommendation,
  context: ExplanationContext,
): Explanation {
  const { reason, confidence } = reasonForRecommendation(recommendation);
  const referencedCategory = findReferencedCategory(recommendation.reason);
  return draft(
    "recommendation",
    recommendation.id,
    {
      title: recommendation.title,
      summary: recommendation.description,
      reason,
      supportingEvidence: evidenceForRecommendation(
        recommendation,
        context.budgets,
        context.transactions,
        context.now,
      ),
      confidence,
      tags: [recommendation.priority, recommendation.category],
      relatedObjects: referencedCategory
        ? [{ type: "category", id: referencedCategory, label: referencedCategory }]
        : [],
    },
    context.now,
  );
}

export function buildRecurringTransactionExplanation(
  item: RecurringTransaction,
  context: ExplanationContext,
): Explanation {
  const { reason, confidence } = reasonForRecurringTransaction(item);
  return draft(
    "recurring-transaction",
    item.id,
    {
      title: item.title,
      summary: `${item.frequency} · ${formatAmount(item.averageAmount)} · ${item.status}`,
      reason,
      supportingEvidence: evidenceForRecurringTransaction(item),
      confidence,
      tags: [item.status, ...(item.isSubscription ? ["subscription"] : [])],
      relatedObjects: item.merchantId
        ? [{ type: "merchant", id: item.merchantId, label: item.merchantName ?? item.title }]
        : [],
    },
    context.now,
  );
}

export function buildFinancialEventExplanation(event: FinancialEvent, context: ExplanationContext): Explanation {
  const { reason, confidence } = reasonForFinancialEvent(event);
  return draft(
    "financial-event",
    event.id,
    {
      title: event.title,
      summary: event.description,
      reason,
      supportingEvidence: evidenceForFinancialEvent(event),
      confidence,
      tags: [event.type, event.severity],
      relatedObjects: event.relatedTransactionIds
        .slice(0, 5)
        .map((id) => ({ type: "transaction", id, label: "Transaction" })),
    },
    context.now,
  );
}

export function buildMerchantProfileExplanation(profile: MerchantProfile, context: ExplanationContext): Explanation {
  const { reason, confidence } = reasonForMerchantProfile(profile);
  return draft(
    "merchant-profile",
    profile.id,
    {
      title: profile.canonicalName,
      summary: `${profile.industry} · ${formatAmount(profile.totalSpend)} across ${profile.transactionCount} transactions`,
      reason,
      supportingEvidence: evidenceForMerchantProfile(profile),
      confidence,
      tags: [profile.industry, profile.merchantType],
      relatedObjects: [{ type: "category", id: profile.defaultCategory, label: profile.defaultCategory }],
    },
    context.now,
  );
}

export function buildInsightsExplanation(insights: Insights, context: ExplanationContext): Explanation {
  const { reason, confidence } = reasonForInsights(insights);
  return draft(
    "insight",
    "insights:overall",
    {
      title: "Spending Insights",
      summary: `${formatAmount(insights.totalSpent)} across ${insights.totalTransactions} transactions`,
      reason,
      supportingEvidence: evidenceForInsights(insights),
      confidence,
      tags: insights.topCategory ? [insights.topCategory] : [],
      relatedObjects: insights.topCategory
        ? [{ type: "category", id: insights.topCategory, label: insights.topCategory }]
        : [],
    },
    context.now,
  );
}

export function buildTimelineSummaryExplanation(group: TimelineGroup, context: ExplanationContext): Explanation {
  const { reason, confidence } = reasonForTimelineSummary(group);
  return draft(
    "timeline-summary",
    `timeline:${group.key}`,
    {
      title: group.label,
      summary: `${group.transactionCount} transaction(s) totaling ${formatAmount(group.totalAmount)}`,
      reason,
      supportingEvidence: evidenceForTimelineSummary(group),
      confidence,
      tags: [group.key],
      relatedObjects: [],
    },
    context.now,
  );
}

export function buildSearchResultExplanation(item: IndexedObject, context: ExplanationContext): Explanation {
  const { reason, confidence } = reasonForSearchResult(item);
  return draft(
    "search-result",
    item.id,
    {
      title: item.title,
      summary: item.description,
      reason,
      supportingEvidence: evidenceForSearchResult(item),
      confidence,
      tags: item.tags,
      relatedObjects: [{ type: item.type, id: item.id, label: item.title }],
    },
    context.now,
  );
}

export function buildQueryResponseExplanation(result: QueryResult, context: ExplanationContext): Explanation {
  const { reason, confidence } = reasonForQueryResponse(result);
  return draft(
    "query-response",
    result.id,
    {
      title: result.question,
      summary: result.answer,
      reason,
      supportingEvidence: evidenceForQueryResponse(result),
      confidence,
      tags: [result.intent],
      relatedObjects: [],
    },
    context.now,
  );
}
