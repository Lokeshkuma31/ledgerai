import { calculateTotals, getMonthWindow } from "@/lib/forecast/calculator";
import {
  computeConfidence,
  computeDailySafeSpend,
  projectCategorySpending,
  projectEndOfMonthBalance,
  projectExpectedExpenses,
  projectExpectedIncome,
} from "@/lib/forecast/projector";
import type { Insights } from "@/lib/insights/engine";
import type { TimelineGroup } from "@/lib/timeline/engine";
import type { BudgetStatus } from "@/types/budget";
import type { CashFlowForecast } from "@/types/forecast";
import type { RecurringTransaction } from "@/types/recurring";
import type { Transaction } from "@/types/transaction";

/**
 * Deterministic, explainable cash-flow forecasting — no AI. Consumes
 * transactions, recurring items, budget status, insights, and timeline
 * (all already computed by upstream engines) and projects the rest of
 * the current calendar month. Every number here is arithmetic over real
 * historical data; nothing is estimated by a model.
 */
export function generateForecast(
  transactions: Transaction[],
  recurring: RecurringTransaction[],
  budgetStatuses: BudgetStatus[],
  insights: Insights,
  timeline: TimelineGroup[],
  now: Date = new Date(),
): CashFlowForecast {
  const window = getMonthWindow(now);
  const totals = calculateTotals(transactions, recurring, budgetStatuses, timeline, window);

  const expectedIncome = projectExpectedIncome(totals);
  const expectedExpenses = projectExpectedExpenses(totals, window);
  const expectedSavings = expectedIncome - expectedExpenses;
  const projectedEndOfMonthBalance = projectEndOfMonthBalance(totals, expectedExpenses);
  const dailySafeSpend = computeDailySafeSpend(totals, window);
  const confidence = computeConfidence(window, insights.totalTransactions);
  const categoryProjections = projectCategorySpending(budgetStatuses, window);

  return {
    currentBalanceEstimate: totals.currentBalanceEstimate,
    projectedEndOfMonthBalance,
    expectedIncome,
    expectedExpenses,
    expectedSavings,
    dailySafeSpend,
    confidence,
    forecastGeneratedAt: now.toISOString(),
    daysRemaining: window.daysRemaining,
    categoryProjections,
  };
}
