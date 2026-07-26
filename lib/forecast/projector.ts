import type { CalculatedTotals, MonthWindow } from "@/lib/forecast/calculator";
import { classifyRisk } from "@/lib/forecast/risk";
import type { BudgetStatus } from "@/types/budget";
import type { CategoryProjection } from "@/types/forecast";

/** Linear run-rate extrapolation: whatever a category's daily pace has
 * been so far this month, continue it for the remaining days. */
export function projectCategorySpending(
  budgetStatuses: BudgetStatus[],
  window: MonthWindow,
): CategoryProjection[] {
  return budgetStatuses.map((b) => {
    const dailyRate = window.daysElapsed > 0 ? b.currentSpend / window.daysElapsed : 0;
    const projectedSpend = b.currentSpend + dailyRate * window.daysRemaining;
    const projectedPercentageUsed =
      b.monthlyLimit > 0 ? (projectedSpend / b.monthlyLimit) * 100 : null;
    return {
      category: b.category,
      currentSpend: b.currentSpend,
      projectedSpend,
      budgetLimit: b.monthlyLimit,
      projectedPercentageUsed,
      riskLevel: classifyRisk(projectedPercentageUsed),
    };
  });
}

export function projectExpectedIncome(totals: CalculatedTotals): number {
  return totals.incomeSoFar + totals.incomeRemaining;
}

export function projectExpectedExpenses(totals: CalculatedTotals, window: MonthWindow): number {
  const projectedDiscretionary =
    totals.discretionaryExpenseSoFar + totals.averageDailyDiscretionary * window.daysRemaining;
  return totals.recurringExpenseSoFar + totals.recurringExpensesRemaining + projectedDiscretionary;
}

/** currentBalanceEstimate already reflects everything recorded to date
 * (including this month's activity so far), so only what's still
 * projected to happen for the *rest* of the month gets added on top. */
export function projectEndOfMonthBalance(
  totals: CalculatedTotals,
  expectedExpenses: number,
): number {
  const expensesStillToCome =
    expectedExpenses - totals.recurringExpenseSoFar - totals.discretionaryExpenseSoFar;
  return totals.currentBalanceEstimate + totals.incomeRemaining - expensesStillToCome;
}

/** Remaining disposable balance ÷ days remaining. "Remaining disposable" =
 * income still expected this month, minus recurring obligations still
 * due, minus money already earmarked via budgets — not a full
 * balance-sheet view, just what's genuinely free to spend for the rest
 * of the month. */
export function computeDailySafeSpend(totals: CalculatedTotals, window: MonthWindow): number {
  const remainingDisposable =
    totals.incomeRemaining - totals.recurringExpensesRemaining - totals.remainingBudgetCommitments;
  return window.daysRemaining > 0 ? Math.max(0, remainingDisposable) / window.daysRemaining : 0;
}

/** Blends how far into the month we are (more elapsed days = less
 * extrapolation, more certainty) with how much transaction history exists
 * overall (a handful of transactions makes any projection shakier). */
export function computeConfidence(window: MonthWindow, totalTransactionCount: number): number {
  const timeProgress = window.daysElapsed / window.daysInMonth;
  const dataConfidence = Math.min(1, totalTransactionCount / 10);
  return Math.min(0.95, 0.3 + 0.4 * timeProgress + 0.25 * dataConfidence);
}
