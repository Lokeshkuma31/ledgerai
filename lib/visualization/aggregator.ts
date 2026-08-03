import { calculateBudgetStatus } from "@/lib/budget/engine";
import type { CategoryBreakdownEntry } from "@/lib/insights/engine";
import { generateMonthlyCashFlow, type MonthlyCashFlow } from "@/lib/timeline/monthly";
import type { Budget } from "@/types/budget";
import type { Transaction } from "@/types/transaction";
import { parseLocalDate } from "./engine";
import type { DateWindow } from "./types";

/** The same category-resolution rule Insights.categoryBreakdown uses internally — exported so drill-down UI can filter by the same effective category without duplicating the rule. */
export function effectiveCategory(transaction: Transaction): string {
  return transaction.userCategory ?? transaction.aiCategory ?? "Other";
}

/**
 * Category totals for an arbitrary transaction slice (e.g. a filtered
 * time-range window), in the exact same shape as
 * `Insights.categoryBreakdown` (lib/insights/engine.ts) so charts can treat
 * "the dashboard's breakdown" and "a filtered breakdown" identically. This
 * re-derives totals for a *different slice* of transactions than the
 * orchestrator's own `Insights.categoryBreakdown` (which always covers all
 * transactions) — it does not reimplement or diverge from that function's
 * logic, just applies the same sum-and-sort to a narrower input.
 */
export function bucketByCategory(transactions: Transaction[]): CategoryBreakdownEntry[] {
  const totals = new Map<string, number>();
  let grandTotal = 0;
  for (const t of transactions) {
    const category = effectiveCategory(t);
    totals.set(category, (totals.get(category) ?? 0) + t.amount);
    grandTotal += t.amount;
  }
  return [...totals.entries()]
    .map(([category, total]) => ({
      category,
      total,
      percentage: grandTotal === 0 ? 0 : (total / grandTotal) * 100,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Thin pass-through to the existing month-bucketing engine — kept here so
 * chart components import aggregation from one place
 * (`lib/visualization/aggregator.ts`) without needing to know some series
 * come from `lib/timeline/monthly.ts` specifically. No new math.
 */
export function buildCashFlowSeries(
  transactions: Transaction[],
  monthsBack: number,
  now?: Date,
): MonthlyCashFlow[] {
  return generateMonthlyCashFlow(transactions, monthsBack, now);
}

function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
}

const MAX_CASH_FLOW_MONTHS = 24;

/**
 * Chooses how many trailing months to bucket a cash-flow series into for a
 * resolved TimeRange window. "All Time" can span back to a transaction from
 * years ago, so this caps at MAX_CASH_FLOW_MONTHS (using the earliest
 * transaction actually present, not the window's nominal epoch start) —
 * otherwise "All Time" would request thousands of mostly-empty monthly
 * buckets from `generateMonthlyCashFlow`.
 */
export function resolveCashFlowMonthsBack(window: DateWindow, transactions: Transaction[]): number {
  let effectiveStart = window.start;
  if (transactions.length > 0) {
    const earliest = transactions.reduce((min, t) => (t.date < min ? t.date : min), transactions[0].date);
    const earliestDate = parseLocalDate(earliest);
    if (earliestDate > effectiveStart) effectiveStart = earliestDate;
  }
  return Math.min(MAX_CASH_FLOW_MONTHS, Math.max(1, monthsBetween(effectiveStart, window.end)));
}

export interface NetCashFlowPoint {
  month: string;
  label: string;
  net: number;
}

/** Derives net (income - expense) per month from the existing MonthlyCashFlow series — arithmetic on already-computed totals, not a new estimate. */
export function toNetSeries(series: MonthlyCashFlow[]): NetCashFlowPoint[] {
  return series.map((m) => ({ month: m.month, label: m.label, net: m.income - m.expense }));
}

export interface HeatmapCell {
  key: string;
  label: string;
  total: number;
  count: number;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Buckets transactions by calendar day-of-week — the aggregation behind the
 * "Weekly Spending Pattern" chart and one groupBy mode of the generic
 * CalendarHeatmap, collapsing what the brief listed as several distinct
 * heatmap/pattern chart types into one bucketing function plus one render.
 */
export function bucketByDayOfWeek(transactions: Transaction[]): HeatmapCell[] {
  const totals = new Map<number, { total: number; count: number }>();
  for (let i = 0; i < 7; i += 1) totals.set(i, { total: 0, count: 0 });
  for (const t of transactions) {
    const bucket = totals.get(parseLocalDate(t.date).getDay())!;
    bucket.total += t.amount;
    bucket.count += 1;
  }
  return DAY_NAMES.map((label, i) => ({ key: String(i), label, ...totals.get(i)! }));
}

/** Buckets transactions by exact calendar day, sorted chronologically — the "Daily Spending Calendar"/"Spending Heatmap" data source. */
export function bucketByDay(transactions: Transaction[]): HeatmapCell[] {
  const totals = new Map<string, { total: number; count: number }>();
  for (const t of transactions) {
    const bucket = totals.get(t.date) ?? { total: 0, count: 0 };
    bucket.total += t.amount;
    bucket.count += 1;
    totals.set(t.date, bucket);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ key: date, label: date, ...v }));
}

export interface BudgetBurnRatePoint {
  month: string;
  label: string;
  /** percentageUsed per budget category for that month, keyed by category name. */
  [category: string]: string | number;
}

/**
 * A trailing-month burn-rate series per budget, built by calling
 * lib/budget/engine.ts::calculateBudgetStatus once per historical month
 * (against each budget's *current* monthlyLimit, since budgets don't carry
 * historical limits) — still "consuming the engine," just per time bucket,
 * never a reimplementation of percentageUsed/status math.
 */
export function buildBudgetBurnRateSeries(
  budgets: Budget[],
  transactions: Transaction[],
  monthsBack: number,
  now: Date = new Date(),
): BudgetBurnRatePoint[] {
  const points: BudgetBurnRatePoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short" });
    const point: BudgetBurnRatePoint = { month, label };
    for (const status of calculateBudgetStatus(budgets, transactions, d)) {
      point[status.category] = Math.round(status.percentageUsed);
    }
    points.push(point);
  }
  return points;
}
