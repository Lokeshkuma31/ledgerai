import type { BudgetStatus } from "@/types/budget";
import type { EvidenceItem } from "@/types/explanation";
import type { FinancialEvent } from "@/types/event";
import type { CashFlowForecast } from "@/types/forecast";
import type { Insights } from "@/lib/insights/engine";
import type { TimelineGroup } from "@/lib/timeline/engine";
import type { IndexedObject } from "@/types/index";
import type { MerchantProfile } from "@/types/merchant-profile";
import type { QueryResult } from "@/types/query";
import type { Recommendation } from "@/types/recommendation";
import type { RecurringTransaction } from "@/types/recurring";
import { CATEGORIES } from "@/types/transaction";
import type { Transaction } from "@/types/transaction";

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function effectiveCategory(t: Transaction): string {
  return t.userCategory ?? t.aiCategory ?? "Other";
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function previousMonthKey(now: Date): string {
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;
}

export interface CategoryTrend {
  currentTotal: number;
  previousTotal: number;
  /** Fractional change, e.g. 0.18 = +18%. Null when there's no previous-month spending to compare against. */
  percentageChange: number | null;
}

/** Compares this-calendar-month spend against last-calendar-month spend
 * for a single category — pure aggregation over already-classified
 * transactions the same way Insights/executor.ts already sum and filter,
 * not a new financial metric. */
export function computeCategoryMonthOverMonth(
  transactions: Transaction[],
  category: string,
  now: Date,
): CategoryTrend {
  const thisMonth = monthKey(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const lastMonth = previousMonthKey(now);

  let currentTotal = 0;
  let previousTotal = 0;
  for (const t of transactions) {
    if (effectiveCategory(t) !== category) continue;
    const key = monthKey(t.date);
    if (key === thisMonth) currentTotal += t.amount;
    else if (key === lastMonth) previousTotal += t.amount;
  }

  return {
    currentTotal,
    previousTotal,
    percentageChange: previousTotal > 0 ? (currentTotal - previousTotal) / previousTotal : null,
  };
}

export function evidenceForBudget(status: BudgetStatus, transactions: Transaction[], now: Date): EvidenceItem[] {
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthTransactions = transactions.filter(
    (t) => effectiveCategory(t) === status.category && monthKey(t.date) === thisMonth,
  );
  const largest = monthTransactions.reduce((max, t) => Math.max(max, t.amount), 0);

  return [
    { label: "Transactions this month", value: String(monthTransactions.length) },
    { label: "Total spending", value: formatAmount(status.currentSpend) },
    { label: "Budget", value: formatAmount(status.monthlyLimit) },
    { label: "Largest transaction", value: formatAmount(largest) },
  ];
}

export function evidenceForForecast(forecast: CashFlowForecast, recurring: RecurringTransaction[]): EvidenceItem[] {
  const recurringExpenseTotal = recurring
    .filter((r) => r.isExpense && r.frequency === "Monthly")
    .reduce((sum, r) => sum + r.averageAmount, 0);

  return [
    { label: "Recurring expenses", value: formatAmount(recurringExpenseTotal) },
    { label: "Expected income", value: formatAmount(forecast.expectedIncome) },
    { label: "Daily safe-spend allowance", value: `${formatAmount(forecast.dailySafeSpend)}/day` },
    { label: "Days remaining this month", value: String(forecast.daysRemaining) },
  ];
}

/** A Recommendation's own `category` field is its grouping ("Budget",
 * "Savings", ...), not a spending Category — the actual spending category
 * a budget-related recommendation refers to only appears in its reason
 * text (see lib/decision/engine.ts), so it's recovered from there. */
export function findReferencedCategory(text: string): string | undefined {
  return CATEGORIES.find((c) => text.includes(c));
}

export function evidenceForRecommendation(
  recommendation: Recommendation,
  budgets: BudgetStatus[],
  transactions: Transaction[],
  now: Date,
): EvidenceItem[] {
  const evidence: EvidenceItem[] = [{ label: "Basis", value: recommendation.reason }];
  const referencedCategory = findReferencedCategory(recommendation.reason);
  const matchingBudget = budgets.find((b) => b.category === referencedCategory);
  if (matchingBudget) {
    evidence.push(
      { label: `${matchingBudget.category} budget used`, value: `${Math.round(matchingBudget.percentageUsed)}%` },
      { label: "Days remaining this month", value: String(matchingBudget.daysRemainingThisMonth) },
    );
    const trend = computeCategoryMonthOverMonth(transactions, matchingBudget.category, now);
    if (trend.percentageChange !== null) {
      const direction = trend.percentageChange >= 0 ? "up" : "down";
      evidence.push({
        label: "Change vs last month",
        value: `${direction} ${Math.round(Math.abs(trend.percentageChange) * 100)}%`,
      });
    }
  }
  return evidence;
}

export function evidenceForRecurringTransaction(item: RecurringTransaction): EvidenceItem[] {
  return [
    { label: "Occurrences", value: String(item.transactionCount) },
    { label: "Frequency", value: item.frequency },
    { label: "Amount range", value: `${formatAmount(item.minimumAmount)} – ${formatAmount(item.maximumAmount)}` },
    { label: "Confidence", value: `${Math.round(item.confidence * 100)}%` },
  ];
}

function humanizeKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function formatMetadataValue(value: unknown): string | null {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return null; // skip arrays/objects — not worth surfacing as a single evidence line
}

export function evidenceForFinancialEvent(event: FinancialEvent): EvidenceItem[] {
  const evidence: EvidenceItem[] = [{ label: "Date", value: event.date }];
  for (const [key, value] of Object.entries(event.metadata)) {
    const formatted = formatMetadataValue(value);
    if (formatted !== null) evidence.push({ label: humanizeKey(key), value: formatted });
  }
  if (event.relatedTransactionIds.length > 0) {
    evidence.push({ label: "Related transactions", value: String(event.relatedTransactionIds.length) });
  }
  return evidence;
}

export function evidenceForMerchantProfile(profile: MerchantProfile): EvidenceItem[] {
  return [
    { label: "Total spend", value: formatAmount(profile.totalSpend) },
    { label: "Transactions", value: String(profile.transactionCount) },
    { label: "Average transaction", value: formatAmount(profile.averageTransactionAmount) },
    { label: "First seen", value: profile.firstSeen.slice(0, 10) },
  ];
}

export function evidenceForInsights(insights: Insights): EvidenceItem[] {
  return insights.categoryBreakdown.slice(0, 3).map((entry) => ({
    label: entry.category,
    value: `${formatAmount(entry.total)} (${Math.round(entry.percentage)}%)`,
  }));
}

export function evidenceForTimelineSummary(group: TimelineGroup): EvidenceItem[] {
  return [
    { label: "Transactions", value: String(group.transactionCount) },
    { label: "Total", value: formatAmount(group.totalAmount) },
  ];
}

export function evidenceForSearchResult(item: IndexedObject): EvidenceItem[] {
  const evidence: EvidenceItem[] = [{ label: "Object type", value: item.type }];
  if (item.category) evidence.push({ label: "Category", value: item.category });
  if (item.merchant) evidence.push({ label: "Merchant", value: item.merchant });
  if (item.amount !== undefined) evidence.push({ label: "Amount", value: formatAmount(item.amount) });
  if (item.keywords.length > 0) evidence.push({ label: "Keywords", value: item.keywords.join(", ") });
  return evidence;
}

const INCOME_CATEGORIES = ["Salary", "Transfer"];

export function evidenceForQueryResponse(result: QueryResult): EvidenceItem[] {
  const evidence: EvidenceItem[] = [
    { label: "Intent", value: result.intent },
    { label: "Sources", value: "Manually entered and imported (CSV) transactions" },
  ];
  const category = typeof result.context.category === "string" ? result.context.category : undefined;
  if (result.intent === "transaction-search" || result.intent === "category-spending") {
    evidence.push({
      label: "Excludes",
      value:
        category && INCOME_CATEGORIES.includes(category)
          ? "Nothing — this question specifically asked about an income category"
          : "Income transactions (e.g. salary), unless the question specifically asked about them",
    });
  }
  return evidence;
}
