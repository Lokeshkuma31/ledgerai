import type { RecurringStatistics, RecurringTransaction } from "@/types/recurring";
import type { Transaction } from "@/types/transaction";

const SALARY_KEYWORDS = ["salary", "paycheck", "income"];

function effectiveCategory(t: Transaction): string {
  return t.userCategory ?? t.aiCategory ?? "Other";
}

function isIncomeTransaction(t: Transaction): boolean {
  const category = effectiveCategory(t);
  const note = t.note.toLowerCase();
  return category === "Salary" || SALARY_KEYWORDS.some((k) => note.includes(k));
}

/** Normalizes any frequency's average amount to a monthly-equivalent
 * figure, so subscriptions on different cadences can be summed together. */
function monthlyEquivalent(item: RecurringTransaction): number {
  switch (item.frequency) {
    case "Daily":
      return item.averageAmount * 30;
    case "Weekly":
      return item.averageAmount * 4.33;
    case "Biweekly":
      return item.averageAmount * 2.17;
    case "Monthly":
      return item.averageAmount;
    case "Quarterly":
      return item.averageAmount / 3;
    case "Yearly":
      return item.averageAmount / 12;
    case "Unknown":
      return 0; // can't extrapolate a cadence we don't know
  }
}

/**
 * Deterministic, no LLM. Ratios are computed against *all* transactions
 * (not just recurring ones) so "Recurring Expense Ratio" genuinely reflects
 * how much of total spending is predictable vs one-off.
 */
export function computeRecurringStatistics(
  recurringItems: RecurringTransaction[],
  transactions: Transaction[],
): RecurringStatistics {
  const ongoing = recurringItems.filter(
    (r) => r.status !== "Stopped" && r.status !== "Paused",
  );

  const activeSubscriptions = ongoing.filter((r) => r.isSubscription);
  const monthlySubscriptionCost = activeSubscriptions.reduce(
    (sum, r) => sum + monthlyEquivalent(r),
    0,
  );

  const upcomingExpense = ongoing.filter((r) => r.isExpense && r.status === "Upcoming");
  const upcomingIncome = ongoing.filter((r) => r.isIncome && r.status === "Upcoming");

  const recurringExpenseIds = new Set(
    recurringItems.filter((r) => r.isExpense).flatMap((r) => r.relatedTransactionIds),
  );
  const recurringIncomeIds = new Set(
    recurringItems.filter((r) => r.isIncome).flatMap((r) => r.relatedTransactionIds),
  );

  let totalExpense = 0;
  let totalIncome = 0;
  let recurringExpense = 0;
  let recurringIncome = 0;
  for (const t of transactions) {
    if (isIncomeTransaction(t)) {
      totalIncome += t.amount;
      if (recurringIncomeIds.has(t.id)) recurringIncome += t.amount;
    } else {
      totalExpense += t.amount;
      if (recurringExpenseIds.has(t.id)) recurringExpense += t.amount;
    }
  }

  return {
    totalActiveSubscriptions: activeSubscriptions.length,
    monthlySubscriptionCost,
    yearlySubscriptionCost: monthlySubscriptionCost * 12,
    upcomingPaymentsCount: upcomingExpense.length,
    upcomingPaymentsTotal: upcomingExpense.reduce((sum, r) => sum + r.averageAmount, 0),
    upcomingIncomeCount: upcomingIncome.length,
    upcomingIncomeTotal: upcomingIncome.reduce((sum, r) => sum + r.averageAmount, 0),
    recurringExpenseRatio: totalExpense > 0 ? recurringExpense / totalExpense : 0,
    recurringIncomeRatio: totalIncome > 0 ? recurringIncome / totalIncome : 0,
  };
}
