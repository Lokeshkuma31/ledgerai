import { calculateBudgetStatus } from "@/lib/budget/engine";
import {
  computeCoachSignature,
  loadCoachCache,
  saveCoachCache,
} from "@/lib/coach/cache";
import {
  generateFinancialSummary,
  type CoachOutput,
  type MerchantCoachSummary,
} from "@/lib/coach/coach";
import { generateRecommendations } from "@/lib/decision/engine";
import { applyPersistedStatus } from "@/lib/decision/storage";
import { detectFinancialEvents } from "@/lib/events/engine";
import {
  explainBudget,
  explainFinancialEvent,
  explainForecast,
  explainRecommendation,
} from "@/lib/explanations/engine";
import { generateForecast } from "@/lib/forecast/engine";
import { computeForecastStatistics } from "@/lib/forecast/statistics";
import { generateInsights, type Insights } from "@/lib/insights/engine";
import { getAllMerchantProfiles } from "@/lib/merchant/knowledge";
import { detectRecurringTransactions } from "@/lib/recurring/engine";
import type { RecurringReconciliation } from "@/lib/recurring/registry";
import { computeRecurringStatistics } from "@/lib/recurring/statistics";
import { generateTimeline, type TimelineGroup } from "@/lib/timeline/engine";
import type { MemoryEntry } from "@/lib/ai/memory";
import type { MerchantProfile } from "@/types/merchant-profile";
import type { Budget, BudgetStatus } from "@/types/budget";
import type { FinancialEvent } from "@/types/event";
import type { CashFlowForecast, ForecastCoachSummary, ForecastStatistics } from "@/types/forecast";
import type { FinancialState } from "@/types/financial-state";
import type { ExplanationContext, ExplanationCoachSummary } from "@/types/explanation";
import type { RecurringCoachSummary, RecurringStatistics } from "@/types/recurring";
import type { Recommendation } from "@/types/recommendation";
import type { Transaction } from "@/types/transaction";

export interface BuildFinancialStateInput {
  transactions: Transaction[];
  budgets: Budget[];
  memory: MemoryEntry[];
  now?: Date;
}

function emptyInsights(): Insights {
  return {
    totalSpent: 0,
    totalTransactions: 0,
    averageExpense: 0,
    largestExpense: 0,
    smallestExpense: 0,
    topCategory: null,
    topPaymentMethod: null,
    categoryBreakdown: [],
  };
}

function emptyRecurringStatistics(): RecurringStatistics {
  return {
    totalActiveSubscriptions: 0,
    monthlySubscriptionCost: 0,
    yearlySubscriptionCost: 0,
    upcomingPaymentsCount: 0,
    upcomingPaymentsTotal: 0,
    upcomingIncomeCount: 0,
    upcomingIncomeTotal: 0,
    recurringExpenseRatio: 0,
    recurringIncomeRatio: 0,
  };
}

function emptyForecast(now: Date): CashFlowForecast {
  return {
    currentBalanceEstimate: 0,
    projectedEndOfMonthBalance: 0,
    expectedIncome: 0,
    expectedExpenses: 0,
    expectedSavings: 0,
    dailySafeSpend: 0,
    confidence: 0,
    forecastGeneratedAt: now.toISOString(),
    daysRemaining: 0,
    categoryProjections: [],
  };
}

function emptyForecastStatistics(): ForecastStatistics {
  return {
    forecastAccuracy: null,
    savingsRate: 0,
    expenseGrowth: 0,
    incomeGrowth: 0,
    netCashFlow: 0,
    budgetUtilizationForecast: 0,
  };
}

/**
 * Financial Intelligence Orchestrator.
 *
 * Runs the existing engines in dependency order — Timeline → Insights →
 * Budget → Merchant Knowledge → Recurring → Forecast → Events → Decision →
 * AI Coach — and assembles their output into a single FinancialState. Each engine
 * still owns its own calculations; this function only sequences the calls
 * and shapes the result. If one engine fails, the others still run where
 * their inputs don't depend on the failed step, and the failure is
 * recorded in `warnings` rather than throwing.
 *
 * The only genuinely expensive step is the AI Coach's LLM call, and it
 * already has its own signature-based cache (lib/coach/cache.ts) that this
 * function reuses as-is — a cache hit skips the network call entirely. The
 * deterministic engines are cheap pure functions over small in-memory
 * arrays, so they're simply re-run on every call rather than adding a
 * separate memoization layer that could drift out of sync with the
 * recommendation dismiss/complete state.
 */
export async function buildFinancialState(
  input: BuildFinancialStateInput,
): Promise<FinancialState> {
  const now = input.now ?? new Date();
  const { transactions, budgets, memory } = input;
  const warnings: string[] = [];

  let timeline: TimelineGroup[] = [];
  try {
    timeline = generateTimeline(transactions, now);
  } catch {
    warnings.push("Timeline Engine unavailable.");
  }

  let insights: Insights = emptyInsights();
  try {
    insights = generateInsights(transactions);
  } catch {
    warnings.push("Insights Engine unavailable.");
  }

  let budgetStatuses: BudgetStatus[] = [];
  try {
    budgetStatuses = calculateBudgetStatus(budgets, transactions, now);
  } catch {
    warnings.push("Budget Engine unavailable.");
  }

  let merchantProfiles: MerchantProfile[] = [];
  try {
    merchantProfiles = getAllMerchantProfiles();
  } catch {
    warnings.push("Merchant Knowledge Graph unavailable.");
  }

  let recurringReconciliation: RecurringReconciliation = {
    items: [],
    newlyDetected: [],
    amountChanges: [],
  };
  try {
    recurringReconciliation = detectRecurringTransactions(
      transactions,
      merchantProfiles,
      now,
    );
  } catch {
    warnings.push("Recurring Transaction Intelligence Engine unavailable.");
  }
  const recurring = recurringReconciliation.items;

  let recurringStatistics: RecurringStatistics = emptyRecurringStatistics();
  try {
    recurringStatistics = computeRecurringStatistics(recurring, transactions);
  } catch {
    warnings.push("Recurring statistics unavailable.");
  }

  let forecast: CashFlowForecast = emptyForecast(now);
  try {
    forecast = generateForecast(transactions, recurring, budgetStatuses, insights, timeline, now);
  } catch {
    warnings.push("Cash Flow Forecast Engine unavailable.");
  }

  let forecastStatistics: ForecastStatistics = emptyForecastStatistics();
  try {
    forecastStatistics = computeForecastStatistics(forecast, transactions, now);
  } catch {
    warnings.push("Forecast statistics unavailable.");
  }

  let events: FinancialEvent[] = [];
  try {
    events = detectFinancialEvents(transactions, {
      budgetStatuses,
      recurring: recurringReconciliation,
      forecast: { forecast, statistics: forecastStatistics },
      now,
    });
  } catch {
    warnings.push("Financial Events Engine unavailable.");
  }

  let recommendations: Recommendation[] = [];
  try {
    recommendations = applyPersistedStatus(
      generateRecommendations({
        transactions,
        budgets,
        events,
        insights,
        timeline,
        now,
      }),
    );
  } catch {
    warnings.push("Decision Engine unavailable.");
  }

  const reviewedCount = transactions.filter((t) => t.reviewed).length;
  const reviewStats = {
    totalTransactions: transactions.length,
    reviewedCount,
    pendingCount: transactions.length - reviewedCount,
  };
  const memoryStats = { totalEntries: memory.length };
  const activeRecommendations = recommendations.filter(
    (r) => r.status === "new",
  );

  const merchantSummaries: MerchantCoachSummary[] = merchantProfiles
    .filter((p) => p.transactionCount > 0)
    .map((p) => ({
      canonicalName: p.canonicalName,
      industry: p.industry,
      category: p.defaultCategory,
      tags: p.tags,
      isRecurringFriendly: p.isRecurringFriendly,
      transactionCount: p.transactionCount,
      totalSpend: p.totalSpend,
      averageTransactionAmount: p.averageTransactionAmount,
    }));

  const recurringSummaries: RecurringCoachSummary[] = recurring.map((r) => ({
    title: r.title,
    frequency: r.frequency,
    averageAmount: r.averageAmount,
    nextExpectedOccurrence: r.nextExpectedOccurrence,
    status: r.status,
    isSubscription: r.isSubscription,
    isIncome: r.isIncome,
  }));

  const forecastSummary: ForecastCoachSummary | null =
    transactions.length > 0
      ? {
          projectedEndOfMonthBalance: forecast.projectedEndOfMonthBalance,
          expectedIncome: forecast.expectedIncome,
          expectedExpenses: forecast.expectedExpenses,
          expectedSavings: forecast.expectedSavings,
          dailySafeSpend: forecast.dailySafeSpend,
          confidence: forecast.confidence,
          daysRemaining: forecast.daysRemaining,
          categoryRisks: forecast.categoryProjections.map((c) => ({
            category: c.category,
            riskLevel: c.riskLevel,
            projectedPercentageUsed: c.projectedPercentageUsed,
          })),
        }
      : null;

  // Financial Insight & Explanation Engine — generates the authoritative
  // "why" for the objects the Coach is about to summarize, so the Coach
  // narrates these instead of deriving its own reasoning from raw numbers.
  const explanationContext: ExplanationContext = {
    transactions,
    budgets: budgetStatuses,
    events,
    recommendations,
    recurring,
    merchantProfiles,
    forecast,
    insights,
    timeline,
    now,
  };
  const explanations: ExplanationCoachSummary[] = [
    ...budgetStatuses.map((b) => explainBudget(b, explanationContext)),
    ...(transactions.length > 0 ? [explainForecast(explanationContext)] : []),
    ...activeRecommendations
      .slice(0, 10)
      .map((r) => explainRecommendation(r, explanationContext)),
    ...events
      .filter((e) => e.severity === "critical" || e.severity === "important")
      .slice(0, 5)
      .map((e) => explainFinancialEvent(e, explanationContext)),
  ];

  let coachSummary: CoachOutput | null = null;
  if (transactions.length > 0) {
    try {
      const signature = computeCoachSignature(
        transactions,
        memory.length,
        budgetStatuses,
        activeRecommendations.map((r) => r.id),
        merchantSummaries.map((m) => m.canonicalName),
        recurring.map((r) => `${r.id}:${r.status}`),
        forecast.forecastGeneratedAt.slice(0, 10),
      );
      const cached = loadCoachCache();
      if (cached && cached.signature === signature) {
        coachSummary = cached.response;
      } else {
        coachSummary = await generateFinancialSummary({
          insights,
          timeline,
          recentTransactions: transactions.slice(0, 10),
          merchantSummaries,
          recurringSummaries,
          forecastSummary,
          memoryStats,
          reviewStats,
          budgetStatuses,
          events,
          recommendations: activeRecommendations,
          explanations,
        });
        saveCoachCache(signature, coachSummary);
      }
    } catch {
      warnings.push("Coach summary generation failed.");
    }
  }

  const dashboardStats = {
    totalTransactions: transactions.length,
    reviewedCount,
    pendingReviewCount: transactions.length - reviewedCount,
    totalBudgets: budgets.length,
    activeEventCount: events.length,
    activeRecommendationCount: activeRecommendations.length,
    activeRecurringCount: recurring.filter(
      (r) => r.status !== "Stopped" && r.status !== "Paused",
    ).length,
  };

  return {
    timeline,
    insights,
    budgets: budgetStatuses,
    events,
    recommendations,
    recurring,
    recurringStatistics,
    forecast,
    forecastStatistics,
    coachSummary,
    reviewStats,
    memoryStats,
    dashboardStats,
    generatedAt: now.toISOString(),
    warnings,
  };
}
