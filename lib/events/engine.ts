import type { BudgetStatus } from "@/types/budget";
import type { FinancialEvent } from "@/types/event";
import type { CashFlowForecast, ForecastStatistics } from "@/types/forecast";
import type { RecurringTransaction } from "@/types/recurring";
import type { Transaction } from "@/types/transaction";

const DEFAULT_LARGE_EXPENSE_THRESHOLD = 500;
const RECURRING_AMOUNT_TOLERANCE = 0.2; // +/- 20%
const RECURRING_MIN_GAP_DAYS = 25;
const RECURRING_MAX_GAP_DAYS = 35;
const MULTIPLE_EXPENSES_SAME_DAY_THRESHOLD = 5;
const HIGH_SPENDING_DAY_MULTIPLIER = 2;
const SALARY_KEYWORDS = ["salary", "paycheck", "income"];
const FORECAST_RISK_UTILIZATION_THRESHOLD = 1.0; // avg projected budget use > 100%
const INCOME_SHORTFALL_GROWTH_THRESHOLD = -0.1; // income projected down >10% vs last month
const UNEXPECTED_SPENDING_TREND_THRESHOLD = 0.25; // expenses shifted >25% vs last month

export interface DetectFinancialEventsOptions {
  /** Budget Engine output — required for Budget Exceeded / Budget Warning events. */
  budgetStatuses?: BudgetStatus[];
  /** Large-expense threshold. Defaults to 500. */
  largeExpenseThreshold?: number;
  /** Recurring Transaction Intelligence Engine output — required for the
   * subscription/recurring lifecycle events (renewing, missed, new, amount
   * changed). This engine only explains what it's given; it never
   * re-detects recurrence itself. */
  recurring?: {
    items: RecurringTransaction[];
    newlyDetected: RecurringTransaction[];
    amountChanges: { item: RecurringTransaction; previousAmount: number }[];
  };
  /** Cash Flow Forecast Engine output — required for the forecast/cash-flow
   * events. This engine only explains what the forecast already
   * concluded; it never recomputes projections itself. */
  forecast?: {
    forecast: CashFlowForecast;
    statistics: ForecastStatistics;
  };
  now?: Date;
}

function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function effectiveCategory(transaction: Transaction): string {
  return transaction.userCategory ?? transaction.aiCategory ?? "Other";
}

function normalizeKey(note: string): string {
  return note.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / msPerDay,
  );
}

function isWeekend(dateStr: string): boolean {
  const day = parseLocalDate(dateStr).getDay();
  return day === 0 || day === 6;
}

function detectLargeExpenses(
  transactions: Transaction[],
  threshold: number,
  now: Date,
): FinancialEvent[] {
  return transactions
    .filter((t) => t.amount > threshold)
    .map((t) => ({
      id: `large-expense:${t.id}`,
      type: "large-expense",
      title: "Large expense detected",
      description: `A ${formatCurrency(t.amount)} expense on ${t.note} exceeded your ${formatCurrency(threshold)} large-expense threshold.`,
      date: t.date,
      severity: "important",
      relatedTransactionIds: [t.id],
      metadata: {
        amount: t.amount,
        category: effectiveCategory(t),
        threshold,
      },
      createdAt: now.toISOString(),
    }));
}

function detectRecurringExpenses(
  transactions: Transaction[],
  now: Date,
): FinancialEvent[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = normalizeKey(t.note);
    const bucket = groups.get(key);
    if (bucket) bucket.push(t);
    else groups.set(key, [t]);
  }

  const events: FinancialEvent[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map((t) => t.amount);
    const averageAmount =
      amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const similarAmount = amounts.every(
      (a) => Math.abs(a - averageAmount) <= averageAmount * RECURRING_AMOUNT_TOLERANCE,
    );
    if (!similarAmount) continue;

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }
    const averageGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
    const isMonthly =
      averageGap >= RECURRING_MIN_GAP_DAYS && averageGap <= RECURRING_MAX_GAP_DAYS;
    if (!isMonthly) continue;

    const latest = sorted[sorted.length - 1];
    events.push({
      id: `recurring-expense:${key}`,
      type: "recurring-expense",
      title: "Recurring expense detected",
      description: `"${latest.note}" recurs roughly every month at about ${formatCurrency(averageAmount)}.`,
      date: latest.date,
      severity: "info",
      relatedTransactionIds: sorted.map((t) => t.id),
      metadata: {
        note: latest.note,
        averageAmount,
        occurrences: sorted.length,
      },
      createdAt: now.toISOString(),
    });
  }
  return events;
}

function detectSalaryReceived(
  transactions: Transaction[],
  now: Date,
): FinancialEvent[] {
  return transactions
    .filter((t) => {
      const category = effectiveCategory(t);
      const note = t.note.toLowerCase();
      return (
        category === "Salary" ||
        SALARY_KEYWORDS.some((keyword) => note.includes(keyword))
      );
    })
    .map((t) => ({
      id: `salary-received:${t.id}`,
      type: "salary-received",
      title: "Salary received",
      description: `Income of ${formatCurrency(t.amount)} detected.`,
      date: t.date,
      severity: "info",
      relatedTransactionIds: [t.id],
      metadata: { amount: t.amount },
      createdAt: now.toISOString(),
    }));
}

function detectMultipleExpensesSameDay(
  transactions: Transaction[],
  now: Date,
): FinancialEvent[] {
  const byDate = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const bucket = byDate.get(t.date);
    if (bucket) bucket.push(t);
    else byDate.set(t.date, [t]);
  }

  const events: FinancialEvent[] = [];
  for (const [date, group] of byDate) {
    if (group.length <= MULTIPLE_EXPENSES_SAME_DAY_THRESHOLD) continue;
    const total = group.reduce((sum, t) => sum + t.amount, 0);
    events.push({
      id: `multiple-expenses-same-day:${date}`,
      type: "multiple-expenses-same-day",
      title: "Multiple expenses in one day",
      description: `${group.length} transactions totaling ${formatCurrency(total)} were recorded on ${date}.`,
      date,
      severity: "warning",
      relatedTransactionIds: group.map((t) => t.id),
      metadata: { count: group.length, total },
      createdAt: now.toISOString(),
    });
  }
  return events;
}

function detectBudgetEvents(
  budgetStatuses: BudgetStatus[],
  now: Date,
): FinancialEvent[] {
  const today = formatDate(now);
  const events: FinancialEvent[] = [];

  for (const status of budgetStatuses) {
    if (status.status === "exceeded") {
      events.push({
        id: `budget-exceeded:${status.id}`,
        type: "budget-exceeded",
        title: `Budget exceeded for ${status.category}`,
        description: `You spent ${formatCurrency(Math.abs(status.remainingAmount))} above your monthly ${status.category} budget.`,
        date: today,
        severity: "critical",
        relatedTransactionIds: [],
        metadata: {
          category: status.category,
          percentageUsed: status.percentageUsed,
          remainingAmount: status.remainingAmount,
        },
        createdAt: now.toISOString(),
      });
    } else if (status.status === "warning") {
      events.push({
        id: `budget-warning:${status.id}`,
        type: "budget-warning",
        title: `Approaching budget limit for ${status.category}`,
        description: `You've used ${Math.round(status.percentageUsed)}% of your monthly ${status.category} budget, with ${formatCurrency(status.remainingAmount)} remaining.`,
        date: today,
        severity: "warning",
        relatedTransactionIds: [],
        metadata: {
          category: status.category,
          percentageUsed: status.percentageUsed,
          remainingAmount: status.remainingAmount,
        },
        createdAt: now.toISOString(),
      });
    }
  }
  return events;
}

function detectNewMerchants(
  transactions: Transaction[],
  now: Date,
): FinancialEvent[] {
  const sorted = [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt.localeCompare(b.createdAt);
  });

  const seen = new Set<string>();
  const events: FinancialEvent[] = [];
  for (const t of sorted) {
    const key = normalizeKey(t.note);
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({
      id: `new-merchant:${t.id}`,
      type: "new-merchant",
      title: "New merchant",
      description: `First purchase at ${t.note}.`,
      date: t.date,
      severity: "info",
      relatedTransactionIds: [t.id],
      metadata: { note: t.note },
      createdAt: now.toISOString(),
    });
  }
  return events;
}

function detectHighSpendingDays(
  transactions: Transaction[],
  now: Date,
): FinancialEvent[] {
  const byDate = new Map<string, number>();
  for (const t of transactions) {
    byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.amount);
  }
  const dailyTotals = Array.from(byDate.values());
  if (dailyTotals.length === 0) return [];
  const averageDailySpend =
    dailyTotals.reduce((sum, v) => sum + v, 0) / dailyTotals.length;
  if (averageDailySpend <= 0) return [];

  const events: FinancialEvent[] = [];
  for (const [date, total] of byDate) {
    if (total <= averageDailySpend * HIGH_SPENDING_DAY_MULTIPLIER) continue;
    const relatedTransactionIds = transactions
      .filter((t) => t.date === date)
      .map((t) => t.id);
    events.push({
      id: `high-spending-day:${date}`,
      type: "high-spending-day",
      title: "High spending day",
      description: `You spent ${formatCurrency(total)} on ${date}, more than double your average daily spend of ${formatCurrency(averageDailySpend)}.`,
      date,
      severity: "warning",
      relatedTransactionIds,
      metadata: { total, averageDailySpend },
      createdAt: now.toISOString(),
    });
  }
  return events;
}

function detectWeekendSpending(
  transactions: Transaction[],
  now: Date,
): FinancialEvent[] {
  const byDate = new Map<string, number>();
  for (const t of transactions) {
    byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.amount);
  }

  const weekdayTotals: number[] = [];
  const weekendEntries: [string, number][] = [];
  for (const [date, total] of byDate) {
    if (isWeekend(date)) weekendEntries.push([date, total]);
    else weekdayTotals.push(total);
  }
  if (weekdayTotals.length === 0 || weekendEntries.length === 0) return [];
  const weekdayAverage =
    weekdayTotals.reduce((sum, v) => sum + v, 0) / weekdayTotals.length;
  if (weekdayAverage <= 0) return [];

  const events: FinancialEvent[] = [];
  for (const [date, total] of weekendEntries) {
    if (total <= weekdayAverage) continue;
    const relatedTransactionIds = transactions
      .filter((t) => t.date === date)
      .map((t) => t.id);
    events.push({
      id: `weekend-spending:${date}`,
      type: "weekend-spending",
      title: "Weekend spending spike",
      description: `Weekend spending of ${formatCurrency(total)} on ${date} exceeded your average weekday spend of ${formatCurrency(weekdayAverage)}.`,
      date,
      severity: "info",
      relatedTransactionIds,
      metadata: { total, weekdayAverage },
      createdAt: now.toISOString(),
    });
  }
  return events;
}

/**
 * Optional per the spec. Only flags a spending gap once the user already
 * has history before it, so a brand-new account isn't greeted with noise.
 */
function detectNoSpendingDay(
  transactions: Transaction[],
  now: Date,
): FinancialEvent[] {
  if (transactions.length === 0) return [];

  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  );
  const yesterdayStr = formatDate(yesterday);

  const hadSpending = transactions.some((t) => t.date === yesterdayStr);
  if (hadSpending) return [];

  const hasEarlierHistory = transactions.some((t) => t.date < yesterdayStr);
  if (!hasEarlierHistory) return [];

  return [
    {
      id: `no-spending-day:${yesterdayStr}`,
      type: "no-spending-day",
      title: "No spending day",
      description: `No transactions were recorded on ${yesterdayStr}.`,
      date: yesterdayStr,
      severity: "info",
      relatedTransactionIds: [],
      metadata: {},
      createdAt: now.toISOString(),
    },
  ];
}

/**
 * The five recurring-lifecycle event types below only explain what the
 * Recurring Transaction Intelligence Engine already decided — this engine
 * never re-derives frequency, status, or "new"/"changed" itself.
 */
function detectSubscriptionRenewing(
  items: RecurringTransaction[],
  now: Date,
): FinancialEvent[] {
  return items
    .filter((r) => r.isSubscription && r.status === "Upcoming" && r.nextExpectedOccurrence)
    .map((r) => ({
      id: `subscription-renewing:${r.id}`,
      type: "subscription-renewing",
      title: "Subscription renewing soon",
      description: `${r.title} (~${formatCurrency(r.averageAmount)}) is expected to renew on ${r.nextExpectedOccurrence}.`,
      date: r.nextExpectedOccurrence!,
      severity: "info",
      relatedTransactionIds: r.relatedTransactionIds,
      metadata: { title: r.title, averageAmount: r.averageAmount, frequency: r.frequency },
      createdAt: now.toISOString(),
    }));
}

function detectSalaryExpected(items: RecurringTransaction[], now: Date): FinancialEvent[] {
  return items
    .filter((r) => r.isIncome && r.status === "Upcoming" && r.nextExpectedOccurrence)
    .map((r) => ({
      id: `salary-expected:${r.id}`,
      type: "salary-expected",
      title: "Income expected soon",
      description: `${r.title} (~${formatCurrency(r.averageAmount)}) is expected around ${r.nextExpectedOccurrence}.`,
      date: r.nextExpectedOccurrence!,
      severity: "info",
      relatedTransactionIds: r.relatedTransactionIds,
      metadata: { title: r.title, averageAmount: r.averageAmount },
      createdAt: now.toISOString(),
    }));
}

function detectRecurringPaymentMissed(
  items: RecurringTransaction[],
  now: Date,
): FinancialEvent[] {
  return items
    .filter((r) => r.status === "Missed")
    .map((r) => ({
      id: `recurring-payment-missed:${r.id}`,
      type: "recurring-payment-missed",
      title: r.isIncome ? "Expected income overdue" : "Recurring payment missed",
      description: `${r.title} (~${formatCurrency(r.averageAmount)}) was expected around ${r.nextExpectedOccurrence} and hasn't been recorded yet.`,
      date: r.nextExpectedOccurrence ?? formatDate(now),
      severity: r.isIncome ? "warning" : "important",
      relatedTransactionIds: r.relatedTransactionIds,
      metadata: { title: r.title, averageAmount: r.averageAmount },
      createdAt: now.toISOString(),
    }));
}

function detectNewSubscription(
  newlyDetected: RecurringTransaction[],
  now: Date,
): FinancialEvent[] {
  return newlyDetected
    .filter((r) => r.isSubscription)
    .map((r) => ({
      id: `new-subscription-detected:${r.id}`,
      type: "new-subscription-detected",
      title: "New subscription detected",
      description: `${r.title} looks like a new ${r.frequency.toLowerCase()} subscription at ~${formatCurrency(r.averageAmount)}.`,
      date: r.lastOccurrence,
      severity: "info",
      relatedTransactionIds: r.relatedTransactionIds,
      metadata: { title: r.title, averageAmount: r.averageAmount, frequency: r.frequency },
      createdAt: now.toISOString(),
    }));
}

function detectRecurringAmountChanged(
  amountChanges: { item: RecurringTransaction; previousAmount: number }[],
  now: Date,
): FinancialEvent[] {
  return amountChanges.map(({ item, previousAmount }) => ({
    id: `recurring-amount-changed:${item.id}:${item.lastOccurrence}`,
    type: "recurring-amount-changed",
    title: "Recurring amount changed",
    description: `${item.title} changed from ${formatCurrency(previousAmount)} to ${formatCurrency(item.lastAmount)}.`,
    date: item.lastOccurrence,
    severity: "warning",
    relatedTransactionIds: item.relatedTransactionIds,
    metadata: { title: item.title, previousAmount, newAmount: item.lastAmount },
    createdAt: now.toISOString(),
  }));
}

/**
 * The six forecast/cash-flow event types below only explain what the Cash
 * Flow Forecast Engine already concluded — this engine never recomputes
 * projections, risk levels, or growth figures itself.
 */
function detectForecastRiskIncreased(
  forecast: CashFlowForecast,
  statistics: ForecastStatistics,
  now: Date,
): FinancialEvent[] {
  if (statistics.budgetUtilizationForecast <= FORECAST_RISK_UTILIZATION_THRESHOLD) return [];
  const today = formatDate(now);
  return [
    {
      id: `forecast-risk-increased:${today}`,
      type: "forecast-risk-increased",
      title: "Forecast risk increased",
      description: `Across your budgeted categories, projected spending now averages ${Math.round(statistics.budgetUtilizationForecast * 100)}% of budget for the month.`,
      date: today,
      severity: "warning",
      relatedTransactionIds: [],
      metadata: { budgetUtilizationForecast: statistics.budgetUtilizationForecast },
      createdAt: now.toISOString(),
    },
  ];
}

function detectBudgetLikelyExceeded(forecast: CashFlowForecast, now: Date): FinancialEvent[] {
  const today = formatDate(now);
  return forecast.categoryProjections
    .filter((c) => c.riskLevel === "High Risk" || c.riskLevel === "Critical")
    .map((c) => ({
      id: `budget-likely-exceeded:${c.category}`,
      type: "budget-likely-exceeded" as const,
      title: `Budget likely to be exceeded for ${c.category}`,
      description: `${c.category} is projected to reach ${Math.round(c.projectedPercentageUsed ?? 0)}% of its ${formatCurrency(c.budgetLimit ?? 0)} budget by month-end.`,
      date: today,
      severity: c.riskLevel === "Critical" ? "critical" : ("important" as const),
      relatedTransactionIds: [],
      metadata: {
        category: c.category,
        projectedSpend: c.projectedSpend,
        budgetLimit: c.budgetLimit,
        riskLevel: c.riskLevel,
      },
      createdAt: now.toISOString(),
    }));
}

function detectCashFlowDirection(forecast: CashFlowForecast, now: Date): FinancialEvent[] {
  const today = formatDate(now);
  if (forecast.expectedSavings > 0) {
    return [
      {
        id: `positive-cash-flow:${today}`,
        type: "positive-cash-flow",
        title: "Positive cash flow projected",
        description: `You're projected to end the month with ${formatCurrency(forecast.expectedSavings)} in savings.`,
        date: today,
        severity: "info",
        relatedTransactionIds: [],
        metadata: { expectedSavings: forecast.expectedSavings },
        createdAt: now.toISOString(),
      },
    ];
  }
  if (forecast.expectedSavings < 0) {
    return [
      {
        id: `negative-cash-flow:${today}`,
        type: "negative-cash-flow",
        title: "Negative cash flow projected",
        description: `You're projected to end the month ${formatCurrency(Math.abs(forecast.expectedSavings))} short.`,
        date: today,
        severity: "warning",
        relatedTransactionIds: [],
        metadata: { expectedSavings: forecast.expectedSavings },
        createdAt: now.toISOString(),
      },
    ];
  }
  return [];
}

function detectIncomeShortfall(statistics: ForecastStatistics, now: Date): FinancialEvent[] {
  if (statistics.incomeGrowth > INCOME_SHORTFALL_GROWTH_THRESHOLD) return [];
  const today = formatDate(now);
  return [
    {
      id: `income-shortfall:${today}`,
      type: "income-shortfall",
      title: "Income shortfall projected",
      description: `Expected income this month is down ${Math.round(Math.abs(statistics.incomeGrowth) * 100)}% versus last month.`,
      date: today,
      severity: "warning",
      relatedTransactionIds: [],
      metadata: { incomeGrowth: statistics.incomeGrowth },
      createdAt: now.toISOString(),
    },
  ];
}

function detectUnexpectedSpendingTrend(statistics: ForecastStatistics, now: Date): FinancialEvent[] {
  if (Math.abs(statistics.expenseGrowth) <= UNEXPECTED_SPENDING_TREND_THRESHOLD) return [];
  const today = formatDate(now);
  const direction = statistics.expenseGrowth > 0 ? "up" : "down";
  return [
    {
      id: `unexpected-spending-trend:${today}`,
      type: "unexpected-spending-trend",
      title: "Unexpected spending trend",
      description: `Projected expenses are ${direction} ${Math.round(Math.abs(statistics.expenseGrowth) * 100)}% versus last month.`,
      date: today,
      severity: "info",
      relatedTransactionIds: [],
      metadata: { expenseGrowth: statistics.expenseGrowth },
      createdAt: now.toISOString(),
    },
  ];
}

function sortByDateDesc(events: FinancialEvent[]): FinancialEvent[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.id.localeCompare(a.id);
  });
}

/**
 * Deterministic, pure TypeScript — no React, no LLM. Converts raw
 * transaction history (plus Budget Engine output, when available) into a
 * structured feed of financial events. The AI Financial Coach later
 * explains these events; it never detects them.
 */
export function detectFinancialEvents(
  transactions: Transaction[],
  options: DetectFinancialEventsOptions = {},
): FinancialEvent[] {
  const now = options.now ?? new Date();
  const threshold = options.largeExpenseThreshold ?? DEFAULT_LARGE_EXPENSE_THRESHOLD;
  const budgetStatuses = options.budgetStatuses ?? [];
  const recurring = options.recurring;
  const forecast = options.forecast;

  const events: FinancialEvent[] = [
    ...detectLargeExpenses(transactions, threshold, now),
    ...detectRecurringExpenses(transactions, now),
    ...detectSalaryReceived(transactions, now),
    ...detectMultipleExpensesSameDay(transactions, now),
    ...detectBudgetEvents(budgetStatuses, now),
    ...detectNewMerchants(transactions, now),
    ...detectHighSpendingDays(transactions, now),
    ...detectWeekendSpending(transactions, now),
    ...detectNoSpendingDay(transactions, now),
    ...(recurring
      ? [
          ...detectSubscriptionRenewing(recurring.items, now),
          ...detectSalaryExpected(recurring.items, now),
          ...detectRecurringPaymentMissed(recurring.items, now),
          ...detectNewSubscription(recurring.newlyDetected, now),
          ...detectRecurringAmountChanged(recurring.amountChanges, now),
        ]
      : []),
    ...(forecast
      ? [
          ...detectForecastRiskIncreased(forecast.forecast, forecast.statistics, now),
          ...detectBudgetLikelyExceeded(forecast.forecast, now),
          ...detectCashFlowDirection(forecast.forecast, now),
          ...detectIncomeShortfall(forecast.statistics, now),
          ...detectUnexpectedSpendingTrend(forecast.statistics, now),
        ]
      : []),
  ];

  return sortByDateDesc(events);
}
