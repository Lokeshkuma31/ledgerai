import type { BudgetStatus } from "@/types/budget";
import type { FinancialEvent, FinancialEventType } from "@/types/event";
import type { FeedItem } from "@/types/feed";
import type { CashFlowForecast, ForecastStatistics } from "@/types/forecast";
import type { Insights } from "@/lib/insights/engine";
import type { TimelineGroup, TimelineGroupKey } from "@/lib/timeline/engine";
import type { MerchantProfile } from "@/types/merchant-profile";
import type { Recommendation } from "@/types/recommendation";
import type { RecurringTransaction } from "@/types/recurring";
import type { Transaction } from "@/types/transaction";

const SAVINGS_MILESTONE_TIERS = [5000, 10000, 25000, 50000, 100000, 250000, 500000];
const TRANSACTION_MILESTONES = [50, 100, 250, 500, 1000, 2500, 5000];

const UNUSUAL_SPENDING_EVENT_TYPES: FinancialEventType[] = [
  "high-spending-day",
  "weekend-spending",
  "multiple-expenses-same-day",
  "unexpected-spending-trend",
];

const CASH_FLOW_EVENT_TYPES: FinancialEventType[] = [
  "positive-cash-flow",
  "negative-cash-flow",
  "income-shortfall",
];

function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function currentMonthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function endOfMonthIso(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
}

function isoWeekKey(now: Date): string {
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function sumGroups(
  timeline: TimelineGroup[],
  keys: TimelineGroupKey[],
): { total: number; count: number } {
  const matched = timeline.filter((g) => keys.includes(g.key));
  return {
    total: matched.reduce((sum, g) => sum + g.totalAmount, 0),
    count: matched.reduce((sum, g) => sum + g.transactionCount, 0),
  };
}

/** Fills in the fields every FeedItem shares. `priority` is a placeholder —
 * lib/feed/prioritizer.ts is the only place that assigns the real score.
 * `createdAt` defaults to `now`, but callers wrapping another engine's
 * already-timestamped object (an event, a recommendation) should pass that
 * object's own createdAt so the feed reflects when the situation actually
 * arose, not when this generation run happened. */
function makeItem(
  id: string,
  now: Date,
  fields: Omit<FeedItem, "id" | "priority" | "isRead" | "isPinned" | "isDismissed" | "createdAt"> & {
    createdAt?: string;
  },
): FeedItem {
  const { createdAt, ...rest } = fields;
  return {
    id,
    createdAt: createdAt ?? now.toISOString(),
    priority: 0,
    isRead: false,
    isPinned: false,
    isDismissed: false,
    ...rest,
  };
}

/** Budget Engine → Budget Warning: a category at warning or exceeded status. */
export function generateBudgetWarnings(budgetStatuses: BudgetStatus[], now: Date): FeedItem[] {
  return budgetStatuses
    .filter((s) => s.status === "warning" || s.status === "exceeded")
    .map((s) =>
      makeItem(`feed:budget:warning:${s.id}`, now, {
        type: "budget-warning",
        title:
          s.status === "exceeded"
            ? `Budget exceeded for ${s.category}`
            : `Approaching budget limit for ${s.category}`,
        summary:
          s.status === "exceeded"
            ? `You spent ${formatCurrency(Math.abs(s.remainingAmount))} above your monthly ${s.category} budget.`
            : `You've used ${Math.round(s.percentageUsed)}% of your monthly ${s.category} budget, with ${formatCurrency(s.remainingAmount)} remaining.`,
        severity: s.status === "exceeded" ? "critical" : "warning",
        sourceEngine: "budget",
        relatedObjectIds: [s.id],
        explanationId: `budget:${s.id}`,
        confidence: 1,
        expiresAt: endOfMonthIso(now),
        metadata: { category: s.category, percentageUsed: s.percentageUsed, remainingAmount: s.remainingAmount },
      }),
    );
}

/** Budget Engine → Budget Recovered: a category that was previously warned
 * about (per the Feed Registry) is back to "safe" this run. Takes the set
 * of currently-warned categories as plain data rather than reading the
 * registry itself, so this stays a pure function of its arguments — the
 * lookback lives in lib/feed/engine.ts, the one file allowed to cross into
 * persistence. */
export function generateBudgetRecovered(
  budgetStatuses: BudgetStatus[],
  previouslyWarnedCategories: Set<string>,
  now: Date,
): FeedItem[] {
  return budgetStatuses
    .filter((s) => s.status === "safe" && previouslyWarnedCategories.has(s.category))
    .map((s) =>
      makeItem(`feed:budget:recovered:${s.id}:${currentMonthKey(now)}`, now, {
        type: "budget-recovered",
        title: `${s.category} budget back on track`,
        summary: `${s.category} spending has dropped back to ${Math.round(s.percentageUsed)}% of its monthly budget.`,
        severity: "positive",
        sourceEngine: "budget",
        relatedObjectIds: [s.id],
        explanationId: `budget:${s.id}`,
        confidence: 1,
        expiresAt: endOfMonthIso(now),
        metadata: { category: s.category, percentageUsed: s.percentageUsed },
      }),
    );
}

/** Cash Flow Forecast Engine → Forecast Update: one living summary per
 * month, updated in place (same deterministic id) rather than re-posted
 * every run. */
export function generateForecastUpdate(
  forecast: CashFlowForecast,
  statistics: ForecastStatistics,
  now: Date,
): FeedItem[] {
  const isRisky = statistics.budgetUtilizationForecast > 1 || forecast.expectedSavings < 0;
  return [
    makeItem(`feed:forecast:update:${currentMonthKey(now)}`, now, {
      type: "forecast-update",
      title: "Cash flow forecast updated",
      summary: `Projected to end the month with ${formatCurrency(forecast.projectedEndOfMonthBalance)} (${formatCurrency(Math.abs(forecast.expectedSavings))} ${forecast.expectedSavings >= 0 ? "saved" : "short"}).`,
      severity: isRisky ? "warning" : "info",
      sourceEngine: "forecast",
      relatedObjectIds: [],
      explanationId: "forecast:forecast:overall",
      confidence: forecast.confidence,
      expiresAt: null,
      metadata: {
        projectedEndOfMonthBalance: forecast.projectedEndOfMonthBalance,
        expectedSavings: forecast.expectedSavings,
        daysRemaining: forecast.daysRemaining,
      },
    }),
  ];
}

/** Cash Flow Forecast Engine → Savings Milestone: the highest savings tier
 * crossed this month. Only a new tier produces a new id, so the feed
 * doesn't re-announce the same milestone every run. */
export function generateSavingsMilestoneItems(forecast: CashFlowForecast, now: Date): FeedItem[] {
  if (forecast.expectedSavings <= 0) return [];
  const tier = [...SAVINGS_MILESTONE_TIERS].reverse().find((t) => forecast.expectedSavings >= t);
  if (!tier) return [];
  return [
    makeItem(`feed:forecast:savings-milestone:${currentMonthKey(now)}:${tier}`, now, {
      type: "savings-milestone",
      title: `On track to save ${formatCurrency(tier)}+ this month`,
      summary: `Projected savings of ${formatCurrency(forecast.expectedSavings)} have crossed the ${formatCurrency(tier)} mark.`,
      severity: "positive",
      sourceEngine: "forecast",
      relatedObjectIds: [],
      explanationId: "forecast:forecast:overall",
      confidence: forecast.confidence,
      expiresAt: endOfMonthIso(now),
      metadata: { tier, expectedSavings: forecast.expectedSavings },
    }),
  ];
}

/** Financial Events Engine → Large Expense: relays what Events already
 * detected; this engine never re-detects it. */
export function generateLargeExpenseItems(events: FinancialEvent[], now: Date): FeedItem[] {
  return events
    .filter((e) => e.type === "large-expense")
    .map((e) =>
      makeItem(`feed:events:${e.id}`, now, {
        type: "large-expense",
        title: e.title,
        summary: e.description,
        severity: "warning",
        sourceEngine: "events",
        relatedObjectIds: e.relatedTransactionIds,
        explanationId: `financial-event:${e.id}`,
        confidence: 1,
        createdAt: e.createdAt,
        expiresAt: null,
        metadata: e.metadata,
      }),
    );
}

/** Financial Events Engine → Unusual Spending: high-spending days, weekend
 * spikes, same-day expense clusters, and unexpected spending-trend shifts. */
export function generateUnusualSpendingItems(events: FinancialEvent[], now: Date): FeedItem[] {
  return events
    .filter((e) => UNUSUAL_SPENDING_EVENT_TYPES.includes(e.type))
    .map((e) =>
      makeItem(`feed:events:${e.id}`, now, {
        type: "unusual-spending",
        title: e.title,
        summary: e.description,
        severity: e.severity === "critical" ? "critical" : e.severity === "important" ? "important" : "warning",
        sourceEngine: "events",
        relatedObjectIds: e.relatedTransactionIds,
        explanationId: `financial-event:${e.id}`,
        confidence: 1,
        createdAt: e.createdAt,
        expiresAt: null,
        metadata: e.metadata,
      }),
    );
}

/** Financial Events Engine → Salary Received. */
export function generateSalaryReceivedItems(events: FinancialEvent[], now: Date): FeedItem[] {
  return events
    .filter((e) => e.type === "salary-received")
    .map((e) =>
      makeItem(`feed:events:${e.id}`, now, {
        type: "salary-received",
        title: e.title,
        summary: e.description,
        severity: "positive",
        sourceEngine: "events",
        relatedObjectIds: e.relatedTransactionIds,
        explanationId: `financial-event:${e.id}`,
        confidence: 1,
        createdAt: e.createdAt,
        expiresAt: null,
        metadata: e.metadata,
      }),
    );
}

/** Financial Events Engine → Cash Flow Change: positive/negative cash-flow
 * projection and income-shortfall signals, already computed from the
 * forecast by the Events Engine. */
export function generateCashFlowChangeItems(events: FinancialEvent[], now: Date): FeedItem[] {
  return events
    .filter((e) => CASH_FLOW_EVENT_TYPES.includes(e.type))
    .map((e) =>
      makeItem(`feed:events:${e.id}`, now, {
        type: "cash-flow-change",
        title: e.title,
        summary: e.description,
        severity: e.type === "positive-cash-flow" ? "positive" : "warning",
        sourceEngine: "events",
        relatedObjectIds: e.relatedTransactionIds,
        explanationId: `financial-event:${e.id}`,
        confidence: 1,
        createdAt: e.createdAt,
        expiresAt: null,
        metadata: e.metadata,
      }),
    );
}

/** Recurring Transaction Intelligence Engine → New Subscription. Prefers
 * the reconciliation's `newlyDetected` set when the caller has it (richer
 * signal); otherwise falls back to items whose createdAt/updatedAt haven't
 * diverged yet, meaning they haven't survived a second reconciliation. */
export function generateNewSubscriptionItems(
  recurring: RecurringTransaction[],
  newlyDetected: RecurringTransaction[] | undefined,
  now: Date,
): FeedItem[] {
  const source = newlyDetected ?? recurring.filter((r) => r.createdAt === r.updatedAt);
  return source
    .filter((r) => r.isSubscription)
    .map((r) =>
      makeItem(`feed:recurring:new-subscription:${r.id}`, now, {
        type: "new-subscription",
        title: "New subscription detected",
        summary: `${r.title} looks like a new ${r.frequency.toLowerCase()} subscription at ~${formatCurrency(r.averageAmount)}.`,
        severity: "info",
        sourceEngine: "recurring",
        relatedObjectIds: r.relatedTransactionIds,
        explanationId: `recurring-transaction:${r.id}`,
        confidence: r.confidence,
        createdAt: r.createdAt,
        expiresAt: null,
        metadata: { title: r.title, averageAmount: r.averageAmount, frequency: r.frequency },
      }),
    );
}

/** Recurring Transaction Intelligence Engine → Subscription Renewal. */
export function generateSubscriptionRenewalItems(recurring: RecurringTransaction[], now: Date): FeedItem[] {
  return recurring
    .filter((r) => r.isSubscription && r.status === "Upcoming" && r.nextExpectedOccurrence)
    .map((r) =>
      makeItem(`feed:recurring:renewal:${r.id}:${r.nextExpectedOccurrence}`, now, {
        type: "subscription-renewal",
        title: "Subscription renewing soon",
        summary: `${r.title} (~${formatCurrency(r.averageAmount)}) is expected to renew on ${r.nextExpectedOccurrence}.`,
        severity: "info",
        sourceEngine: "recurring",
        relatedObjectIds: r.relatedTransactionIds,
        explanationId: `recurring-transaction:${r.id}`,
        confidence: r.confidence,
        expiresAt: r.nextExpectedOccurrence ? `${r.nextExpectedOccurrence}T23:59:59.999Z` : null,
        metadata: { title: r.title, averageAmount: r.averageAmount, merchant: r.merchantName },
      }),
    );
}

/** Recurring Transaction Intelligence Engine → Salary Expected. */
export function generateSalaryExpectedItems(recurring: RecurringTransaction[], now: Date): FeedItem[] {
  return recurring
    .filter((r) => r.isIncome && r.status === "Upcoming" && r.nextExpectedOccurrence)
    .map((r) =>
      makeItem(`feed:recurring:salary-expected:${r.id}:${r.nextExpectedOccurrence}`, now, {
        type: "salary-expected",
        title: "Income expected soon",
        summary: `${r.title} (~${formatCurrency(r.averageAmount)}) is expected around ${r.nextExpectedOccurrence}.`,
        severity: "positive",
        sourceEngine: "recurring",
        relatedObjectIds: r.relatedTransactionIds,
        explanationId: `recurring-transaction:${r.id}`,
        confidence: r.confidence,
        expiresAt: r.nextExpectedOccurrence ? `${r.nextExpectedOccurrence}T23:59:59.999Z` : null,
        metadata: { title: r.title, averageAmount: r.averageAmount },
      }),
    );
}

/** Merchant Knowledge Graph → Merchant Insight: the current top merchant by spend. */
export function generateMerchantInsightItems(merchantProfiles: MerchantProfile[], now: Date): FeedItem[] {
  const active = merchantProfiles.filter((p) => p.transactionCount > 0);
  if (active.length === 0) return [];
  const top = active.reduce((max, p) => (p.totalSpend > max.totalSpend ? p : max));
  return [
    makeItem(`feed:merchant:top-spend:${currentMonthKey(now)}`, now, {
      type: "merchant-insight",
      title: `${top.canonicalName} is your top merchant`,
      summary: `${formatCurrency(top.totalSpend)} across ${top.transactionCount} transaction(s) at ${top.canonicalName} (${top.industry}).`,
      severity: "info",
      sourceEngine: "merchant",
      relatedObjectIds: [top.id],
      explanationId: `merchant-profile:${top.id}`,
      confidence: top.confidence,
      expiresAt: null,
      metadata: { merchant: top.canonicalName, totalSpend: top.totalSpend, transactionCount: top.transactionCount },
    }),
  ];
}

/** Insights Engine → Category Trend: the current top spending category. */
export function generateCategoryTrendItems(insights: Insights, now: Date): FeedItem[] {
  if (insights.categoryBreakdown.length === 0) return [];
  const top = insights.categoryBreakdown[0];
  return [
    makeItem(`feed:insights:category-trend:${currentMonthKey(now)}:${top.category}`, now, {
      type: "category-trend",
      title: `${top.category} is your top spending category`,
      summary: `${top.category} accounts for ${Math.round(top.percentage)}% of your total spending (${formatCurrency(top.total)}).`,
      severity: "info",
      sourceEngine: "insights",
      relatedObjectIds: [],
      explanationId: "insight:insights:overall",
      confidence: 0.9,
      expiresAt: null,
      metadata: { category: top.category, percentage: top.percentage, total: top.total },
    }),
  ];
}

const RECOMMENDATION_SEVERITY: Record<Recommendation["priority"], FeedItem["severity"]> = {
  critical: "critical",
  high: "important",
  medium: "warning",
  low: "info",
};

/** Decision Engine → Recommendation: only active (status "new") recommendations surface. */
export function generateRecommendationItems(recommendations: Recommendation[], now: Date): FeedItem[] {
  return recommendations
    .filter((r) => r.status === "new")
    .map((r) =>
      makeItem(`feed:decision:${r.id}`, now, {
        type: "recommendation",
        title: r.title,
        summary: r.description,
        severity: RECOMMENDATION_SEVERITY[r.priority],
        sourceEngine: "decision",
        relatedObjectIds: [r.id],
        explanationId: `recommendation:${r.id}`,
        confidence: 0.85,
        createdAt: r.createdAt,
        expiresAt: null,
        metadata: { category: r.category, priority: r.priority },
      }),
    );
}

/** Cross-engine → Financial Achievement: positive milestones that don't
 * belong to a single upstream engine's own output. */
export function generateAchievementItems(
  budgetStatuses: BudgetStatus[],
  forecast: CashFlowForecast,
  now: Date,
): FeedItem[] {
  const items: FeedItem[] = [];

  if (budgetStatuses.length > 0 && budgetStatuses.every((s) => s.status === "safe")) {
    items.push(
      makeItem(`feed:feed:achievement:all-budgets-on-track:${currentMonthKey(now)}`, now, {
        type: "achievement",
        title: "All budgets on track",
        summary: `Every one of your ${budgetStatuses.length} budgets is within its monthly limit.`,
        severity: "positive",
        sourceEngine: "budget",
        relatedObjectIds: budgetStatuses.map((s) => s.id),
        explanationId: null,
        confidence: 1,
        expiresAt: endOfMonthIso(now),
        metadata: { budgetCount: budgetStatuses.length },
      }),
    );
  }

  if (forecast.expectedSavings > 0 && forecast.daysRemaining <= 3) {
    items.push(
      makeItem(`feed:feed:achievement:positive-month:${currentMonthKey(now)}`, now, {
        type: "achievement",
        title: "Ending the month with savings",
        summary: `With the month nearly over, you're projected to save ${formatCurrency(forecast.expectedSavings)}.`,
        severity: "positive",
        sourceEngine: "forecast",
        relatedObjectIds: [],
        explanationId: "forecast:forecast:overall",
        confidence: forecast.confidence,
        expiresAt: endOfMonthIso(now),
        metadata: { expectedSavings: forecast.expectedSavings },
      }),
    );
  }

  return items;
}

/** Timeline Engine → Weekly Summary: aggregates the today/yesterday/last-7-days buckets. */
export function generateWeeklySummaryItems(timeline: TimelineGroup[], now: Date): FeedItem[] {
  const { total, count } = sumGroups(timeline, ["today", "yesterday", "last7Days"]);
  if (count === 0) return [];
  return [
    makeItem(`feed:feed:weekly-summary:${isoWeekKey(now)}`, now, {
      type: "weekly-summary",
      title: "This week's spending summary",
      summary: `${count} transaction(s) totaling ${formatCurrency(total)} over the past week.`,
      severity: "info",
      sourceEngine: "timeline",
      relatedObjectIds: [],
      explanationId: null,
      confidence: 1,
      expiresAt: null,
      metadata: { total, count, week: isoWeekKey(now) },
    }),
  ];
}

/** Insights Engine + Timeline → Monthly Summary. */
export function generateMonthlySummaryItems(
  timeline: TimelineGroup[],
  insights: Insights,
  now: Date,
): FeedItem[] {
  const { total, count } = sumGroups(timeline, ["today", "yesterday", "last7Days", "thisMonth"]);
  if (count === 0) return [];
  return [
    makeItem(`feed:feed:monthly-summary:${currentMonthKey(now)}`, now, {
      type: "monthly-summary",
      title: "This month's spending summary",
      summary: `${count} transaction(s) totaling ${formatCurrency(total)} so far this month${insights.topCategory ? `, led by ${insights.topCategory}` : ""}.`,
      severity: "info",
      sourceEngine: "insights",
      relatedObjectIds: [],
      explanationId: insights.totalTransactions > 0 ? "insight:insights:overall" : null,
      confidence: 1,
      expiresAt: null,
      metadata: { total, count, topCategory: insights.topCategory },
    }),
  ];
}

/** Feed Engine's own → System Insight: light-touch, engine-agnostic
 * observations — currently a transaction-count milestone. */
export function generateSystemInsightItems(transactions: Transaction[], now: Date): FeedItem[] {
  const count = transactions.length;
  const milestone = [...TRANSACTION_MILESTONES].reverse().find((m) => count >= m);
  if (!milestone) return [];
  return [
    makeItem(`feed:feed:system-insight:transaction-count:${milestone}`, now, {
      type: "system-insight",
      title: `You've logged ${milestone}+ transactions`,
      summary: `LedgerAI has tracked ${count} transactions for you so far.`,
      severity: "info",
      sourceEngine: "feed",
      relatedObjectIds: [],
      explanationId: null,
      confidence: 1,
      expiresAt: null,
      metadata: { milestone, transactionCount: count },
    }),
  ];
}
