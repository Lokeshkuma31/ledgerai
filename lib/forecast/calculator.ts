import type { TimelineGroup } from "@/lib/timeline/engine";
import type { BudgetStatus } from "@/types/budget";
import type { RecurringTransaction } from "@/types/recurring";
import type { Transaction } from "@/types/transaction";

const SALARY_KEYWORDS = ["salary", "paycheck", "income"];

function effectiveCategory(t: Transaction): string {
  return t.userCategory ?? t.aiCategory ?? "Other";
}

/** Same income heuristic used by the Recurring Engine and Financial Events
 * Engine — kept here too since the calculator needs it standalone. */
export function isIncomeTransaction(t: Transaction): boolean {
  const category = effectiveCategory(t);
  const note = t.note.toLowerCase();
  return category === "Salary" || SALARY_KEYWORDS.some((k) => note.includes(k));
}

function isInMonth(dateStr: string, year: number, month: number): boolean {
  const [y, m] = dateStr.split("-").map(Number);
  return y === year && m - 1 === month;
}

export interface MonthWindow {
  year: number;
  month: number; // 0-indexed
  daysInMonth: number;
  /** Includes today. */
  daysElapsed: number;
  /** Includes today. */
  daysRemaining: number;
  todayDate: string; // "YYYY-MM-DD"
  endOfMonthDate: string; // "YYYY-MM-DD"
}

export function getMonthWindow(now: Date): MonthWindow {
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysElapsed = now.getDate();
  const daysRemaining = daysInMonth - daysElapsed + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    year,
    month,
    daysInMonth,
    daysElapsed,
    daysRemaining,
    todayDate: `${year}-${pad(month + 1)}-${pad(daysElapsed)}`,
    endOfMonthDate: `${year}-${pad(month + 1)}-${pad(daysInMonth)}`,
  };
}

export interface CalculatedTotals {
  incomeSoFar: number;
  expensesSoFar: number;
  recurringExpenseSoFar: number;
  discretionaryExpenseSoFar: number;
  incomeRemaining: number;
  recurringExpensesRemaining: number;
  /** Blends the full month-to-date rate with the more recent last-7-days
   * rate, so a recent change in habits shows up faster than waiting for
   * the whole month's average to catch up. */
  averageDailyDiscretionary: number;
  /** Sum of unspent room across configured budgets — money already
   * earmarked, not free discretionary cash. */
  remainingBudgetCommitments: number;
  /** No bank integration — a derived proxy (all-time income minus
   * expenses recorded), not a real account balance. */
  currentBalanceEstimate: number;
}

/**
 * Deterministic month-scoped totals — the raw numbers projector.ts turns
 * into forward-looking estimates. No projection or risk logic lives here;
 * this module only measures what already happened.
 */
export function calculateTotals(
  transactions: Transaction[],
  recurring: RecurringTransaction[],
  budgetStatuses: BudgetStatus[],
  timeline: TimelineGroup[],
  window: MonthWindow,
): CalculatedTotals {
  const thisMonth = transactions.filter((t) => isInMonth(t.date, window.year, window.month));
  const incomeThisMonth = thisMonth.filter(isIncomeTransaction);
  const expenseThisMonth = thisMonth.filter((t) => !isIncomeTransaction(t));

  const recurringExpenseIds = new Set(
    recurring.filter((r) => r.isExpense).flatMap((r) => r.relatedTransactionIds),
  );

  const incomeSoFar = incomeThisMonth.reduce((sum, t) => sum + t.amount, 0);
  const expensesSoFar = expenseThisMonth.reduce((sum, t) => sum + t.amount, 0);
  const recurringExpenseSoFar = expenseThisMonth
    .filter((t) => recurringExpenseIds.has(t.id))
    .reduce((sum, t) => sum + t.amount, 0);
  const discretionaryExpenseSoFar = expensesSoFar - recurringExpenseSoFar;

  const incomeRemaining = recurring
    .filter(
      (r) =>
        r.isIncome &&
        r.nextExpectedOccurrence &&
        r.nextExpectedOccurrence >= window.todayDate &&
        r.nextExpectedOccurrence <= window.endOfMonthDate,
    )
    .reduce((sum, r) => sum + r.averageAmount, 0);

  const recurringExpensesRemaining = recurring
    .filter(
      (r) =>
        r.isExpense &&
        r.nextExpectedOccurrence &&
        r.nextExpectedOccurrence >= window.todayDate &&
        r.nextExpectedOccurrence <= window.endOfMonthDate,
    )
    .reduce((sum, r) => sum + r.averageAmount, 0);

  const monthToDateDailyRate =
    window.daysElapsed > 0 ? discretionaryExpenseSoFar / window.daysElapsed : 0;

  const last7Days = timeline.find((g) => g.key === "last7Days");
  const recentDiscretionary = last7Days
    ? last7Days.transactions
        .filter((t) => !isIncomeTransaction(t) && !recurringExpenseIds.has(t.id))
        .reduce((sum, t) => sum + t.amount, 0)
    : null;
  const recentDailyRate = recentDiscretionary !== null ? recentDiscretionary / 7 : monthToDateDailyRate;
  const averageDailyDiscretionary = (monthToDateDailyRate + recentDailyRate) / 2;

  const remainingBudgetCommitments = budgetStatuses.reduce(
    (sum, b) => sum + Math.max(0, b.monthlyLimit - b.currentSpend),
    0,
  );

  const currentBalanceEstimate = transactions.reduce(
    (sum, t) => sum + (isIncomeTransaction(t) ? t.amount : -t.amount),
    0,
  );

  return {
    incomeSoFar,
    expensesSoFar,
    recurringExpenseSoFar,
    discretionaryExpenseSoFar,
    incomeRemaining,
    recurringExpensesRemaining,
    averageDailyDiscretionary,
    remainingBudgetCommitments,
    currentBalanceEstimate,
  };
}
