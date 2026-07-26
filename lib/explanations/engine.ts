import {
  buildBudgetExplanation,
  buildFinancialEventExplanation,
  buildForecastExplanation,
  buildInsightsExplanation,
  buildMerchantProfileExplanation,
  buildQueryResponseExplanation,
  buildRecommendationExplanation,
  buildRecurringTransactionExplanation,
  buildSearchResultExplanation,
  buildTimelineSummaryExplanation,
} from "@/lib/explanations/builder";
import { upsertExplanation } from "@/lib/explanations/registry";
import type { BudgetStatus } from "@/types/budget";
import type { Explanation, ExplanationContext } from "@/types/explanation";
import type { FinancialEvent } from "@/types/event";
import type { IndexedObject } from "@/types/index";
import type { MerchantProfile } from "@/types/merchant-profile";
import type { QueryResult } from "@/types/query";
import type { Recommendation } from "@/types/recommendation";
import type { RecurringTransaction } from "@/types/recurring";

/**
 * Financial Insight & Explanation Engine — the only path from a
 * deterministic financial object to a structured explanation of it.
 * Every function here builds (builder.ts, using reasoner.ts + evidence.ts
 * + templates.ts) and persists (registry.ts) one Explanation; nothing
 * here calculates a new financial metric, it only narrates and evidences
 * numbers other engines already produced.
 */
export function explainBudget(status: BudgetStatus, context: ExplanationContext): Explanation {
  return upsertExplanation(buildBudgetExplanation(status, context));
}

export function explainForecast(context: ExplanationContext): Explanation {
  return upsertExplanation(buildForecastExplanation(context.forecast, context));
}

export function explainRecommendation(recommendation: Recommendation, context: ExplanationContext): Explanation {
  return upsertExplanation(buildRecommendationExplanation(recommendation, context));
}

export function explainRecurringTransaction(item: RecurringTransaction, context: ExplanationContext): Explanation {
  return upsertExplanation(buildRecurringTransactionExplanation(item, context));
}

export function explainFinancialEvent(event: FinancialEvent, context: ExplanationContext): Explanation {
  return upsertExplanation(buildFinancialEventExplanation(event, context));
}

export function explainMerchantProfile(profile: MerchantProfile, context: ExplanationContext): Explanation {
  return upsertExplanation(buildMerchantProfileExplanation(profile, context));
}

export function explainInsights(context: ExplanationContext): Explanation {
  return upsertExplanation(buildInsightsExplanation(context.insights, context));
}

export function explainTimelineSummary(
  group: ExplanationContext["timeline"][number],
  context: ExplanationContext,
): Explanation {
  return upsertExplanation(buildTimelineSummaryExplanation(group, context));
}

export function explainSearchResult(item: IndexedObject, context: ExplanationContext): Explanation {
  return upsertExplanation(buildSearchResultExplanation(item, context));
}

export function explainQueryResponse(result: QueryResult, context: ExplanationContext): Explanation {
  return upsertExplanation(buildQueryResponseExplanation(result, context));
}

/** Generates and persists an explanation for every currently-known
 * budget, recommendation, recurring item, and event — used by the
 * Semantic Index (to index explanations) and anywhere else that needs
 * the full set rather than one at a time. */
export function explainAll(context: ExplanationContext): Explanation[] {
  const explanations: Explanation[] = [
    ...context.budgets.map((b) => explainBudget(b, context)),
    explainForecast(context),
    ...context.recommendations.filter((r) => r.status === "new").map((r) => explainRecommendation(r, context)),
    ...context.recurring.map((r) => explainRecurringTransaction(r, context)),
    ...context.events.map((e) => explainFinancialEvent(e, context)),
    ...context.merchantProfiles.filter((p) => p.transactionCount > 0).map((p) => explainMerchantProfile(p, context)),
    explainInsights(context),
    ...context.timeline.map((g) => explainTimelineSummary(g, context)),
  ];
  return explanations;
}
