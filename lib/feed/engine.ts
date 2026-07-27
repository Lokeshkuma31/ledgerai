import { deduplicateFeedItems } from "@/lib/feed/deduplicator";
import {
  generateAchievementItems,
  generateBudgetRecovered,
  generateBudgetWarnings,
  generateCashFlowChangeItems,
  generateCategoryTrendItems,
  generateForecastUpdate,
  generateLargeExpenseItems,
  generateMerchantInsightItems,
  generateMonthlySummaryItems,
  generateNewSubscriptionItems,
  generateRecommendationItems,
  generateSalaryExpectedItems,
  generateSalaryReceivedItems,
  generateSavingsMilestoneItems,
  generateSubscriptionRenewalItems,
  generateSystemInsightItems,
  generateUnusualSpendingItems,
  generateWeeklySummaryItems,
} from "@/lib/feed/generator";
import { prioritizeFeedItems, type FeedPriorityWeights } from "@/lib/feed/prioritizer";
import { getAllFeedItems, reconcileFeedItems } from "@/lib/feed/registry";
import type { Insights } from "@/lib/insights/engine";
import type { TimelineGroup } from "@/lib/timeline/engine";
import type { BudgetStatus } from "@/types/budget";
import type { FinancialEvent } from "@/types/event";
import type { FeedItem } from "@/types/feed";
import type { CashFlowForecast, ForecastStatistics } from "@/types/forecast";
import type { MerchantProfile } from "@/types/merchant-profile";
import type { Recommendation } from "@/types/recommendation";
import type { RecurringTransaction } from "@/types/recurring";
import type { Transaction } from "@/types/transaction";

export interface GenerateFeedInput {
  transactions: Transaction[];
  budgetStatuses: BudgetStatus[];
  events: FinancialEvent[];
  recommendations: Recommendation[];
  recurring: RecurringTransaction[];
  /** Recurring Transaction Intelligence Engine's newly-detected set, when
   * the caller already computed it — sharpens "New Subscription" detection.
   * Optional; falls back to a heuristic over `recurring` when absent. */
  newlyDetectedRecurring?: RecurringTransaction[];
  forecast: CashFlowForecast;
  forecastStatistics: ForecastStatistics;
  merchantProfiles: MerchantProfile[];
  insights: Insights;
  timeline: TimelineGroup[];
  priorityWeights?: FeedPriorityWeights;
  now?: Date;
}

/**
 * Financial Intelligence Feed Engine — the single entry point that turns
 * every other engine's already-computed output into a prioritized,
 * deduplicated, persisted feed. Composes the independent generation,
 * deduplication, and prioritization modules with the registry, the same
 * way lib/index/index.ts composes a pure builder with its registry.
 *
 * The feed itself is entirely deterministic: no LLM call happens here. The
 * AI Financial Coach only explains/summarizes the result.
 */
export function generateFeed(input: GenerateFeedInput): FeedItem[] {
  const now = input.now ?? new Date();

  // Cross-run lookback for "Budget Recovered": which categories currently
  // have a live, undismissed warning on record. This is the one place the
  // Feed Engine reads its own registry — the generator functions
  // themselves stay pure over the arguments they're given.
  const previouslyWarnedCategories = new Set(
    getAllFeedItems()
      .filter((item) => item.type === "budget-warning" && !item.isDismissed)
      .map((item) => String(item.metadata.category)),
  );

  const raw: FeedItem[] = [
    ...generateBudgetWarnings(input.budgetStatuses, now),
    ...generateBudgetRecovered(input.budgetStatuses, previouslyWarnedCategories, now),
    ...generateForecastUpdate(input.forecast, input.forecastStatistics, now),
    ...generateSavingsMilestoneItems(input.forecast, now),
    ...generateCashFlowChangeItems(input.events, now),
    ...generateLargeExpenseItems(input.events, now),
    ...generateUnusualSpendingItems(input.events, now),
    ...generateSalaryReceivedItems(input.events, now),
    ...generateNewSubscriptionItems(input.recurring, input.newlyDetectedRecurring, now),
    ...generateSubscriptionRenewalItems(input.recurring, now),
    ...generateSalaryExpectedItems(input.recurring, now),
    ...generateMerchantInsightItems(input.merchantProfiles, now),
    ...generateCategoryTrendItems(input.insights, now),
    ...generateRecommendationItems(input.recommendations, now),
    ...generateAchievementItems(input.budgetStatuses, input.forecast, now),
    ...generateWeeklySummaryItems(input.timeline, now),
    ...generateMonthlySummaryItems(input.timeline, input.insights, now),
    ...generateSystemInsightItems(input.transactions, now),
  ];

  const deduped = deduplicateFeedItems(raw);
  const prioritized = prioritizeFeedItems(deduped, input.priorityWeights);
  return reconcileFeedItems(prioritized);
}
