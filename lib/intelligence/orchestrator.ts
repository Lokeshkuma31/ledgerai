import { calculateBudgetStatus } from "@/lib/budget/engine";
import {
  computeCoachSignature,
  loadCoachCache,
  saveCoachCache,
} from "@/lib/coach/cache";
import { generateFinancialSummary, type CoachOutput } from "@/lib/coach/coach";
import { generateRecommendations } from "@/lib/decision/engine";
import { applyPersistedStatus } from "@/lib/decision/storage";
import { detectFinancialEvents } from "@/lib/events/engine";
import { generateInsights, type Insights } from "@/lib/insights/engine";
import { generateTimeline, type TimelineGroup } from "@/lib/timeline/engine";
import type { MemoryEntry } from "@/lib/ai/memory";
import type { Budget, BudgetStatus } from "@/types/budget";
import type { FinancialEvent } from "@/types/event";
import type { FinancialState } from "@/types/financial-state";
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

/**
 * Financial Intelligence Orchestrator.
 *
 * Runs the existing engines in dependency order — Timeline → Insights →
 * Budget → Events → Decision → AI Coach — and assembles their output into a
 * single FinancialState. Each engine still owns its own calculations; this
 * function only sequences the calls and shapes the result. If one engine
 * fails, the others still run where their inputs don't depend on the failed
 * step, and the failure is recorded in `warnings` rather than throwing.
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

  let events: FinancialEvent[] = [];
  try {
    events = detectFinancialEvents(transactions, { budgetStatuses, now });
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

  let coachSummary: CoachOutput | null = null;
  if (transactions.length > 0) {
    try {
      const signature = computeCoachSignature(
        transactions,
        memory.length,
        budgetStatuses,
        activeRecommendations.map((r) => r.id),
      );
      const cached = loadCoachCache();
      if (cached && cached.signature === signature) {
        coachSummary = cached.response;
      } else {
        coachSummary = await generateFinancialSummary({
          insights,
          timeline,
          recentTransactions: transactions.slice(0, 10),
          memoryStats,
          reviewStats,
          budgetStatuses,
          events,
          recommendations: activeRecommendations,
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
  };

  return {
    timeline,
    insights,
    budgets: budgetStatuses,
    events,
    recommendations,
    coachSummary,
    reviewStats,
    memoryStats,
    dashboardStats,
    generatedAt: now.toISOString(),
    warnings,
  };
}
