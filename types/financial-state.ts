import type { CoachOutput, MemoryStats, ReviewStats } from "@/lib/coach/coach";
import type { Insights } from "@/lib/insights/engine";
import type { TimelineGroup } from "@/lib/timeline/engine";
import type { BudgetStatus } from "@/types/budget";
import type { FinancialEvent } from "@/types/event";
import type { CashFlowForecast, ForecastStatistics } from "@/types/forecast";
import type { Recommendation } from "@/types/recommendation";
import type { RecurringStatistics, RecurringTransaction } from "@/types/recurring";

export interface DashboardStats {
  totalTransactions: number;
  reviewedCount: number;
  pendingReviewCount: number;
  totalBudgets: number;
  activeEventCount: number;
  activeRecommendationCount: number;
  activeRecurringCount: number;
}

/**
 * The single object the Dashboard consumes. Prepared exclusively by
 * lib/intelligence/orchestrator.ts — every field here is the output of a
 * specialized engine, never computed by a UI component.
 */
export interface FinancialState {
  timeline: TimelineGroup[];
  insights: Insights;
  /** Budget Engine output — one entry per configured budget. */
  budgets: BudgetStatus[];
  events: FinancialEvent[];
  /** Full set (new/dismissed/completed) — the Dashboard filters for display. */
  recommendations: Recommendation[];
  /** Recurring Transaction Intelligence Engine output. */
  recurring: RecurringTransaction[];
  recurringStatistics: RecurringStatistics;
  /** Cash Flow Forecast Engine output. */
  forecast: CashFlowForecast;
  forecastStatistics: ForecastStatistics;
  coachSummary: CoachOutput | null;
  reviewStats: ReviewStats;
  memoryStats: MemoryStats;
  dashboardStats: DashboardStats;
  /** ISO 8601 timestamp — when this state was built. */
  generatedAt: string;
  /** Non-fatal engine failures encountered while building this state. */
  warnings: string[];
}
