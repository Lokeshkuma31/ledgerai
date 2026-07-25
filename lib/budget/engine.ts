import type { Budget, BudgetStatus, BudgetStatusLevel } from "@/types/budget";
import type { Transaction } from "@/types/transaction";

function effectiveCategory(transaction: Transaction): string {
  return transaction.userCategory ?? transaction.aiCategory ?? "Other";
}

function isInMonth(dateStr: string, year: number, month: number): boolean {
  const [y, m] = dateStr.split("-").map(Number);
  return y === year && m - 1 === month;
}

function daysRemainingInMonth(now: Date): number {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return daysInMonth - now.getDate() + 1;
}

function resolveStatus(percentageUsed: number): BudgetStatusLevel {
  if (percentageUsed > 100) return "exceeded";
  if (percentageUsed >= 80) return "warning";
  return "safe";
}

/**
 * Deterministic, pure TypeScript — no React, no storage access. Owns every
 * budget calculation so callers (dashboard UI today; alerts, reports,
 * forecasting, and AI features later) only ever consume structured output,
 * never compute percentages or remaining amounts themselves.
 */
export function calculateBudgetStatus(
  budgets: Budget[],
  transactions: Transaction[],
  now: Date = new Date(),
): BudgetStatus[] {
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysRemainingThisMonth = daysRemainingInMonth(now);

  return budgets.map((budget) => {
    const matching = transactions.filter(
      (t) =>
        effectiveCategory(t) === budget.category &&
        isInMonth(t.date, year, month),
    );
    const currentSpend = matching.reduce((sum, t) => sum + t.amount, 0);
    const remainingAmount = budget.monthlyLimit - currentSpend;
    const percentageUsed =
      budget.monthlyLimit > 0
        ? (currentSpend / budget.monthlyLimit) * 100
        : currentSpend > 0
          ? Infinity
          : 0;

    return {
      id: budget.id,
      category: budget.category,
      monthlyLimit: budget.monthlyLimit,
      currentSpend,
      remainingAmount,
      percentageUsed,
      transactionCount: matching.length,
      daysRemainingThisMonth,
      status: resolveStatus(percentageUsed),
    };
  });
}
