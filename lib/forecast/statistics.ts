import { isIncomeTransaction } from "@/lib/forecast/calculator";
import type { CashFlowForecast, ForecastStatistics } from "@/types/forecast";
import type { Transaction } from "@/types/transaction";

function isInMonth(dateStr: string, year: number, month: number): boolean {
  const [y, m] = dateStr.split("-").map(Number);
  return y === year && m - 1 === month;
}

function previousMonth(now: Date): { year: number; month: number } {
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return { year, month };
}

function sumExpenses(transactions: Transaction[]): number {
  return transactions.filter((t) => !isIncomeTransaction(t)).reduce((sum, t) => sum + t.amount, 0);
}

function sumIncome(transactions: Transaction[]): number {
  return transactions.filter(isIncomeTransaction).reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Backtests the forecast approach against the *previous* calendar month:
 * extrapolates that month's first-half daily expense rate across its
 * second half, and compares the extrapolation to what actually happened.
 * Returns null when there isn't a full previous month of history to test
 * against — an honest "we can't tell yet" rather than a fabricated number.
 */
function backtestAccuracy(transactions: Transaction[], now: Date): number | null {
  const { year, month } = previousMonth(now);
  const monthTx = transactions.filter((t) => isInMonth(t.date, year, month));
  if (monthTx.length === 0) return null;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const midpoint = Math.floor(daysInMonth / 2);
  if (midpoint < 3 || daysInMonth - midpoint < 3) return null;

  const dayOf = (t: Transaction) => Number(t.date.split("-")[2]);
  const firstHalf = monthTx.filter((t) => dayOf(t) <= midpoint);
  const secondHalf = monthTx.filter((t) => dayOf(t) > midpoint);
  if (firstHalf.length === 0) return null;

  const dailyRate = sumExpenses(firstHalf) / midpoint;
  const predictedSecondHalf = dailyRate * (daysInMonth - midpoint);
  const actualSecondHalf = sumExpenses(secondHalf);

  if (actualSecondHalf === 0 && predictedSecondHalf === 0) return 1;
  const denominator = Math.max(actualSecondHalf, predictedSecondHalf, 1);
  const error = Math.abs(predictedSecondHalf - actualSecondHalf) / denominator;
  return Math.max(0, 1 - error);
}

/**
 * Deterministic, no LLM. Growth figures compare the current forecast's
 * full-month projection against last month's *actuals* — the only trend
 * baseline available without persisting historical forecasts.
 */
export function computeForecastStatistics(
  forecast: CashFlowForecast,
  transactions: Transaction[],
  now: Date = new Date(),
): ForecastStatistics {
  const { year, month } = previousMonth(now);
  const lastMonthTx = transactions.filter((t) => isInMonth(t.date, year, month));
  const lastMonthExpenses = sumExpenses(lastMonthTx);
  const lastMonthIncome = sumIncome(lastMonthTx);

  const expenseGrowth =
    lastMonthExpenses > 0 ? (forecast.expectedExpenses - lastMonthExpenses) / lastMonthExpenses : 0;
  const incomeGrowth =
    lastMonthIncome > 0 ? (forecast.expectedIncome - lastMonthIncome) / lastMonthIncome : 0;

  const budgeted = forecast.categoryProjections.filter((c) => c.projectedPercentageUsed !== null);
  const budgetUtilizationForecast =
    budgeted.length === 0
      ? 0
      : budgeted.reduce((sum, c) => sum + (c.projectedPercentageUsed ?? 0), 0) / budgeted.length / 100;

  return {
    forecastAccuracy: backtestAccuracy(transactions, now),
    savingsRate: forecast.expectedIncome > 0 ? forecast.expectedSavings / forecast.expectedIncome : 0,
    expenseGrowth,
    incomeGrowth,
    netCashFlow: forecast.expectedIncome - forecast.expectedExpenses,
    budgetUtilizationForecast,
  };
}
