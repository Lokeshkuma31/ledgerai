import { searchFinancialIndex } from "@/lib/index";
import type { BudgetStatus } from "@/types/budget";
import type { FinancialEvent } from "@/types/event";
import type { FinancialIndex, IndexedObject } from "@/types/index";
import type { AmountEntity, ExecutionPlan, QueryDataSources } from "@/types/query";
import type { Recommendation } from "@/types/recommendation";
import type { RecurringTransaction } from "@/types/recurring";
import type { Transaction } from "@/types/transaction";

const SALARY_KEYWORDS = ["salary", "paycheck", "income"];
const INCOME_CATEGORIES = ["Salary", "Transfer"];
const UNLIMITED = Number.MAX_SAFE_INTEGER;

function effectiveCategory(t: Transaction): string {
  return t.userCategory ?? t.aiCategory ?? "Other";
}

function isIncomeTransaction(t: Transaction): boolean {
  const category = effectiveCategory(t);
  const note = t.note.toLowerCase();
  return category === "Salary" || SALARY_KEYWORDS.some((k) => note.includes(k));
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function resolve<T extends { id: string }>(objects: IndexedObject[], map: Map<string, T>): T[] {
  const resolved: T[] = [];
  for (const obj of objects) {
    const item = map.get(obj.id);
    if (item) resolved.push(item);
  }
  return resolved;
}

/**
 * The Semantic Index is consulted first (type/category/merchant/date
 * narrow the candidate set there); once relevant objects are identified,
 * this resolves their ids back to the full Transaction records that
 * carry the precision an exact amount comparison needs.
 */
function findTransactions(
  index: FinancialIndex,
  data: QueryDataSources,
  filters: { category?: string; merchant?: string; dateRange?: { start: string; end: string } },
): Transaction[] {
  const result = searchFinancialIndex(index, {
    query: "",
    filters: { types: ["transaction"], ...filters },
    limit: UNLIMITED,
  });
  return resolve(
    result.items.map((i) => i.object),
    byId(data.transactions),
  );
}

function applyAmountFilter(transactions: Transaction[], amount?: AmountEntity): Transaction[] {
  if (!amount) return transactions;
  return transactions.filter((t) => {
    switch (amount.comparison) {
      case "more-than":
        return t.amount > amount.amount;
      case "less-than":
        return t.amount < amount.amount;
      case "at-least":
        return t.amount >= amount.amount;
      case "at-most":
        return t.amount <= amount.amount;
      case "exactly":
        return Math.abs(t.amount - amount.amount) < 0.01;
    }
  });
}

/** Excludes income by default (a "purchase" or "expense" question should
 * never surface a salary deposit as the answer) unless the question is
 * explicitly about an income-ish category. */
function excludeIncomeUnlessRequested(transactions: Transaction[], category?: string): Transaction[] {
  if (category && INCOME_CATEGORIES.includes(category)) return transactions;
  return transactions.filter((t) => !isIncomeTransaction(t));
}

function summarize(transactions: Transaction[]) {
  const amounts = transactions.map((t) => t.amount);
  const totalSpent = amounts.reduce((sum, a) => sum + a, 0);
  return {
    transactionCount: transactions.length,
    totalSpent,
    largestPurchase: amounts.length > 0 ? Math.max(...amounts) : 0,
    smallestPurchase: amounts.length > 0 ? Math.min(...amounts) : 0,
    averagePurchase: transactions.length > 0 ? totalSpent / transactions.length : 0,
  };
}

const SUPERLATIVE_LARGEST = ["biggest", "largest", "most expensive", "highest"];
const SUPERLATIVE_SMALLEST = ["smallest", "cheapest", "lowest", "least expensive"];

export function executeTransactionSearch(plan: ExecutionPlan, data: QueryDataSources, index: FinancialIndex) {
  const { dateRange, merchant, category, amount } = plan.entities;
  const candidates = findTransactions(index, data, {
    category,
    merchant,
    dateRange: dateRange ? { start: dateRange.start, end: dateRange.end } : undefined,
  });
  const matched = applyAmountFilter(excludeIncomeUnlessRequested(candidates, category), amount);
  const lower = plan.question.toLowerCase();

  if (SUPERLATIVE_LARGEST.some((k) => lower.includes(k))) {
    const top = [...matched].sort((a, b) => b.amount - a.amount)[0];
    return { transaction: top ?? null, ...summarize(matched) };
  }
  if (SUPERLATIVE_SMALLEST.some((k) => lower.includes(k))) {
    const bottom = [...matched].sort((a, b) => a.amount - b.amount)[0];
    return { transaction: bottom ?? null, ...summarize(matched) };
  }

  const sorted = [...matched].sort((a, b) => b.date.localeCompare(a.date));
  return { transactions: sorted.slice(0, 20), ...summarize(matched) };
}

export function executeCategorySpending(plan: ExecutionPlan, data: QueryDataSources, index: FinancialIndex) {
  const category = plan.entities.category;
  const dateRange = plan.entities.dateRange
    ? { start: plan.entities.dateRange.start, end: plan.entities.dateRange.end }
    : undefined;

  const inRange = findTransactions(index, data, { dateRange });
  const matched = category ? findTransactions(index, data, { category, dateRange }) : [];
  // "Percentage of total spending" is measured against expenses only —
  // including income in the denominator would silently deflate every
  // category's share. A question about an income category (e.g. "Salary")
  // still matches correctly above; only the denominator excludes income.
  const totalAllCategories = inRange
    .filter((t) => !isIncomeTransaction(t))
    .reduce((sum, t) => sum + t.amount, 0);
  const stats = summarize(matched);

  return {
    category: category ?? null,
    percentageOfTotal: totalAllCategories > 0 ? (stats.totalSpent / totalAllCategories) * 100 : 0,
    ...stats,
  };
}

export function executeMerchantSpending(plan: ExecutionPlan, data: QueryDataSources, index: FinancialIndex) {
  const merchantName = plan.entities.merchant;

  if (!merchantName) {
    // "Which merchants cost me the most?" — no specific merchant named;
    // the index's own ranking (merchant-profile objects carry totalSpend
    // as their `amount` field) identifies the relevant merchants directly.
    const result = searchFinancialIndex(index, {
      query: "",
      filters: { types: ["merchant-profile"] },
      sortBy: "amount",
      limit: 5,
    });
    const top = result.items.map((item) => ({
      merchant: item.object.title,
      totalSpent: item.object.amount ?? 0,
      transactionCount: (item.object.metadata.transactionCount as number | undefined) ?? 0,
      industry: (item.object.metadata.industry as string | undefined) ?? null,
    }));
    return { topMerchants: top };
  }

  const matched = applyAmountFilter(
    excludeIncomeUnlessRequested(
      findTransactions(index, data, { merchant: merchantName, dateRange: plan.entities.dateRange }),
      plan.entities.category,
    ),
    plan.entities.amount,
  );
  const profile = data.merchantProfiles.find(
    (m) => m.canonicalName.toLowerCase() === merchantName.toLowerCase(),
  );
  return {
    merchant: merchantName,
    industry: profile?.industry ?? null,
    ...summarize(matched),
  };
}

export function executeBudgetStatus(plan: ExecutionPlan, data: QueryDataSources, index: FinancialIndex) {
  const category = plan.entities.category;
  const result = searchFinancialIndex(index, {
    query: "",
    filters: { types: ["budget"], category },
    limit: UNLIMITED,
  });
  const budgets: BudgetStatus[] = resolve(
    result.items.map((i) => i.object),
    byId(data.budgets),
  );

  return {
    budgets: budgets.map((b) => ({
      category: b.category,
      monthlyLimit: b.monthlyLimit,
      currentSpend: b.currentSpend,
      remainingAmount: b.remainingAmount,
      percentageUsed: b.percentageUsed,
      status: b.status,
    })),
    exceededCount: budgets.filter((b) => b.status === "exceeded").length,
    warningCount: budgets.filter((b) => b.status === "warning").length,
  };
}

export function executeCashFlowForecast(plan: ExecutionPlan, data: QueryDataSources, index: FinancialIndex) {
  // The index carries one "forecast-summary" object per at-risk category
  // (built alongside the overall forecast in builder.ts) — identifying
  // those first surfaces which categories are worth flagging before the
  // full forecast figures are read below.
  const riskResult = searchFinancialIndex(index, {
    query: "",
    filters: { types: ["forecast-summary"], category: plan.entities.category },
    limit: UNLIMITED,
  });
  const categoriesAtRisk = riskResult.items
    .filter((item) => item.object.id !== "forecast:overall")
    .map((item) => ({
      category: item.object.category ?? item.object.title,
      riskLevel: item.object.tags[0] ?? "Watch",
      projectedSpend: item.object.amount ?? 0,
    }));

  const { forecast } = data;
  const dateRange = plan.entities.dateRange;
  const requestedDays = dateRange
    ? Math.round(
        (new Date(dateRange.end).getTime() - new Date(dateRange.start).getTime()) /
          (24 * 60 * 60 * 1000),
      ) + 1
    : null;

  return {
    projectedEndOfMonthBalance: forecast.projectedEndOfMonthBalance,
    expectedIncome: forecast.expectedIncome,
    expectedExpenses: forecast.expectedExpenses,
    expectedSavings: forecast.expectedSavings,
    dailySafeSpend: forecast.dailySafeSpend,
    daysRemaining: forecast.daysRemaining,
    confidence: forecast.confidence,
    ...(requestedDays !== null
      ? {
          requestedPeriodDays: requestedDays,
          safeSpendForRequestedPeriod:
            forecast.dailySafeSpend * Math.min(requestedDays, forecast.daysRemaining),
        }
      : {}),
    categoryProjections: forecast.categoryProjections,
    categoriesAtRisk,
  };
}

export function executeRecurringPayments(plan: ExecutionPlan, data: QueryDataSources, index: FinancialIndex) {
  const frequency = plan.entities.frequency;
  const subscriptionsOnly = plan.question.toLowerCase().includes("subscription");

  const result = searchFinancialIndex(index, {
    query: "",
    filters: { types: ["recurring-transaction"] },
    limit: UNLIMITED,
  });
  let items: RecurringTransaction[] = resolve(
    result.items.map((i) => i.object),
    byId(data.recurring),
  );
  if (frequency) items = items.filter((r) => r.frequency.toLowerCase() === frequency.toLowerCase());
  if (subscriptionsOnly) items = items.filter((r) => r.isSubscription);

  return {
    items: items.map((r) => ({
      title: r.title,
      frequency: r.frequency,
      averageAmount: r.averageAmount,
      nextExpectedOccurrence: r.nextExpectedOccurrence,
      status: r.status,
      isSubscription: r.isSubscription,
      isIncome: r.isIncome,
    })),
    subscriptionCount: items.filter((r) => r.isSubscription).length,
    totalMonthlyEstimate: items
      .filter((r) => r.isExpense && r.frequency === "Monthly")
      .reduce((sum, r) => sum + r.averageAmount, 0),
  };
}

export function executeFinancialEvents(plan: ExecutionPlan, data: QueryDataSources, index: FinancialIndex) {
  const dateRange = plan.entities.dateRange;
  const result = searchFinancialIndex(index, {
    query: "",
    filters: {
      types: ["financial-event"],
      dateRange: dateRange ? { start: dateRange.start, end: dateRange.end } : undefined,
    },
    sortBy: "date",
    limit: dateRange ? UNLIMITED : 10,
  });
  const events: FinancialEvent[] = resolve(
    result.items.map((i) => i.object),
    byId(data.events),
  );

  return {
    events: events.map((e) => ({
      type: e.type,
      title: e.title,
      description: e.description,
      date: e.date,
      severity: e.severity,
    })),
    count: events.length,
  };
}

const PRIORITY_RANK: Record<Recommendation["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const RECOMMENDATIONS_LIMIT = 10;

export function executeRecommendations(_plan: ExecutionPlan, data: QueryDataSources, index: FinancialIndex) {
  const result = searchFinancialIndex(index, {
    query: "",
    filters: { types: ["recommendation"] },
    limit: UNLIMITED,
  });
  const resolved: Recommendation[] = resolve(
    result.items.map((i) => i.object),
    byId(data.recommendations),
  );
  const active = resolved.filter((r) => r.status === "new");
  // The Decision Engine can generate one recommendation per matching
  // historical event — capping to the highest-priority handful keeps a
  // conversational answer from drowning in near-duplicates.
  const top = [...active]
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    .slice(0, RECOMMENDATIONS_LIMIT);

  return {
    recommendations: top.map((r) => ({
      title: r.title,
      description: r.description,
      priority: r.priority,
      category: r.category,
      reason: r.reason,
      action: r.action,
    })),
    count: active.length,
    shown: top.length,
  };
}

export function executeGeneralSummary(_plan: ExecutionPlan, data: QueryDataSources) {
  return {
    totalSpent: data.insights.totalSpent,
    totalTransactions: data.insights.totalTransactions,
    topCategory: data.insights.topCategory,
    categoryBreakdown: data.insights.categoryBreakdown.slice(0, 5),
    budgetsExceeded: data.budgets.filter((b) => b.status === "exceeded").length,
    budgetsWarning: data.budgets.filter((b) => b.status === "warning").length,
    projectedEndOfMonthBalance: data.forecast.projectedEndOfMonthBalance,
    expectedSavings: data.forecast.expectedSavings,
    activeRecurringCount: data.recurring.filter(
      (r) => r.status !== "Stopped" && r.status !== "Paused",
    ).length,
  };
}

export function executeUnknown(plan: ExecutionPlan, data: QueryDataSources) {
  return { question: plan.question, understood: false, hasAnyData: data.transactions.length > 0 };
}
