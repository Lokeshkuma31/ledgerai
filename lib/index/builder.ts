import type { BudgetStatus } from "@/types/budget";
import type { Explanation } from "@/types/explanation";
import type { FinancialEvent } from "@/types/event";
import type { CashFlowForecast } from "@/types/forecast";
import type { FinancialIndex, FinancialIndexSources, IndexedObject, IndexObjectType } from "@/types/index";
import type { TimelineGroup } from "@/lib/timeline/engine";
import type { Insights } from "@/lib/insights/engine";
import type { Merchant } from "@/types/merchant";
import type { MerchantProfile } from "@/types/merchant-profile";
import type { QueryResult } from "@/types/query";
import type { Recommendation } from "@/types/recommendation";
import type { RecurringTransaction } from "@/types/recurring";
import type { Transaction } from "@/types/transaction";

function effectiveCategory(t: Transaction): string {
  return t.userCategory ?? t.aiCategory ?? "Other";
}

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function buildSearchableText(fields: {
  title: string;
  description: string;
  keywords: string[];
  category?: string;
  merchant?: string;
  tags: string[];
}): string {
  return [
    fields.title,
    fields.description,
    ...fields.keywords,
    fields.category ?? "",
    fields.merchant ?? "",
    ...fields.tags,
  ]
    .join(" ")
    .toLowerCase();
}

function makeObject(
  type: IndexObjectType,
  fields: Omit<IndexedObject, "type" | "tags" | "metadata" | "searchableText"> & {
    tags?: string[];
    metadata?: Record<string, unknown>;
  },
): IndexedObject {
  const tags = fields.tags ?? [];
  const metadata = fields.metadata ?? {};
  return {
    ...fields,
    type,
    tags,
    metadata,
    searchableText: buildSearchableText({
      title: fields.title,
      description: fields.description,
      keywords: fields.keywords,
      category: fields.category,
      merchant: fields.merchant,
      tags,
    }),
  };
}

export function indexTransactions(transactions: Transaction[]): IndexedObject[] {
  return transactions.map((t) => {
    const category = effectiveCategory(t);
    return makeObject("transaction", {
      id: t.id,
      title: t.note || t.merchantName || category,
      description: `${formatAmount(t.amount)} · ${category} · ${t.paymentMethod} on ${t.date}`,
      keywords: [t.note, category, t.paymentMethod, t.merchantName ?? ""].filter(Boolean),
      category,
      merchant: t.merchantName,
      date: t.date,
      amount: t.amount,
      tags: t.reviewed ? ["reviewed"] : ["unreviewed"],
      metadata: { reviewed: t.reviewed, merchantId: t.merchantId },
      createdAt: t.createdAt,
      updatedAt: t.createdAt,
    });
  });
}

export function indexMerchants(merchants: Merchant[]): IndexedObject[] {
  return merchants.map((m) =>
    makeObject("merchant", {
      id: m.id,
      title: m.canonicalName,
      description: `${m.transactionCount} transaction${m.transactionCount === 1 ? "" : "s"} seen`,
      keywords: [m.canonicalName, ...m.aliases, m.categoryHint ?? ""].filter(Boolean),
      category: m.categoryHint,
      merchant: m.canonicalName,
      tags: m.aliases,
      metadata: { transactionCount: m.transactionCount, confidence: m.confidence },
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }),
  );
}

export function indexMerchantProfiles(profiles: MerchantProfile[]): IndexedObject[] {
  return profiles
    .filter((p) => p.transactionCount > 0)
    .map((p) =>
      makeObject("merchant-profile", {
        id: p.id,
        title: p.canonicalName,
        description: `${p.industry} · ${formatAmount(p.totalSpend)} across ${p.transactionCount} transactions`,
        keywords: [p.canonicalName, p.industry, p.merchantType, p.defaultCategory, ...p.tags],
        category: p.defaultCategory,
        merchant: p.canonicalName,
        amount: p.totalSpend,
        tags: p.tags,
        metadata: {
          transactionCount: p.transactionCount,
          totalSpend: p.totalSpend,
          averageTransactionAmount: p.averageTransactionAmount,
          isRecurringFriendly: p.isRecurringFriendly,
          industry: p.industry,
        },
        createdAt: p.firstSeen,
        updatedAt: p.updatedAt,
      }),
    );
}

export function indexCategories(insights: Insights, now: Date): IndexedObject[] {
  return insights.categoryBreakdown.map((entry) =>
    makeObject("category", {
      id: `category:${entry.category}`,
      title: entry.category,
      description: `${formatAmount(entry.total)} (${Math.round(entry.percentage)}% of total spending)`,
      keywords: [entry.category],
      category: entry.category,
      amount: entry.total,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }),
  );
}

export function indexTimelineEntries(timeline: TimelineGroup[], now: Date): IndexedObject[] {
  return timeline.map((group) =>
    makeObject("timeline-entry", {
      id: `timeline:${group.key}`,
      title: group.label,
      description: `${group.transactionCount} transaction${group.transactionCount === 1 ? "" : "s"} totaling ${formatAmount(group.totalAmount)}`,
      keywords: [group.label, group.key],
      amount: group.totalAmount,
      metadata: { transactionCount: group.transactionCount },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }),
  );
}

export function indexBudgets(budgets: BudgetStatus[], now: Date): IndexedObject[] {
  return budgets.map((b) =>
    makeObject("budget", {
      id: b.id,
      title: `${b.category} Budget`,
      description: `${formatAmount(b.currentSpend)} of ${formatAmount(b.monthlyLimit)} used (${Math.round(b.percentageUsed)}%) — ${b.status}`,
      keywords: [b.category, b.status, "budget"],
      category: b.category,
      amount: b.monthlyLimit,
      tags: [b.status],
      metadata: {
        currentSpend: b.currentSpend,
        percentageUsed: b.percentageUsed,
        status: b.status,
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }),
  );
}

export function indexFinancialEvents(events: FinancialEvent[]): IndexedObject[] {
  return events.map((e) =>
    makeObject("financial-event", {
      id: e.id,
      title: e.title,
      description: e.description,
      keywords: [e.type, e.severity],
      date: e.date,
      tags: [e.severity],
      metadata: { type: e.type, severity: e.severity },
      createdAt: e.createdAt,
      updatedAt: e.createdAt,
    }),
  );
}

export function indexRecommendations(recommendations: Recommendation[]): IndexedObject[] {
  return recommendations.map((r) =>
    makeObject("recommendation", {
      id: r.id,
      title: r.title,
      description: r.description,
      keywords: [r.title, r.category, r.priority, r.reason],
      category: r.category,
      tags: [r.priority, r.status],
      metadata: { priority: r.priority, status: r.status },
      createdAt: r.createdAt,
      updatedAt: r.createdAt,
    }),
  );
}

export function indexRecurringTransactions(recurring: RecurringTransaction[]): IndexedObject[] {
  return recurring.map((r) =>
    makeObject("recurring-transaction", {
      id: r.id,
      title: r.title,
      description: `${r.frequency} · ${formatAmount(r.averageAmount)} · ${r.status}`,
      keywords: [
        r.title,
        r.frequency,
        r.category,
        r.status,
        r.isSubscription ? "subscription" : "",
        r.merchantName ?? "",
      ].filter(Boolean),
      category: r.category,
      merchant: r.merchantName,
      amount: r.averageAmount,
      tags: [r.status, ...(r.isSubscription ? ["subscription"] : [])],
      metadata: {
        frequency: r.frequency,
        status: r.status,
        isSubscription: r.isSubscription,
        isIncome: r.isIncome,
        nextExpectedOccurrence: r.nextExpectedOccurrence,
      },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }),
  );
}

export function indexForecastSummary(forecast: CashFlowForecast): IndexedObject[] {
  const overall = makeObject("forecast-summary", {
    id: "forecast:overall",
    title: "Cash Flow Forecast",
    description: `Projected month-end balance ${formatAmount(forecast.projectedEndOfMonthBalance)}, ${formatAmount(forecast.dailySafeSpend)}/day safe to spend`,
    keywords: ["forecast", "cash flow", "safe to spend", "projected"],
    amount: forecast.projectedEndOfMonthBalance,
    metadata: {
      expectedIncome: forecast.expectedIncome,
      expectedExpenses: forecast.expectedExpenses,
      expectedSavings: forecast.expectedSavings,
      dailySafeSpend: forecast.dailySafeSpend,
      confidence: forecast.confidence,
    },
    createdAt: forecast.forecastGeneratedAt,
    updatedAt: forecast.forecastGeneratedAt,
  });

  const risky = forecast.categoryProjections
    .filter((c) => c.riskLevel === "Watch" || c.riskLevel === "High Risk" || c.riskLevel === "Critical")
    .map((c) =>
      makeObject("forecast-summary", {
        id: `forecast:category:${c.category}`,
        title: `${c.category} Forecast`,
        description: `Projected ${formatAmount(c.projectedSpend)} — ${c.riskLevel}`,
        keywords: [c.category, c.riskLevel, "forecast", "risk"],
        category: c.category,
        amount: c.projectedSpend,
        tags: [c.riskLevel],
        metadata: { riskLevel: c.riskLevel, projectedPercentageUsed: c.projectedPercentageUsed },
        createdAt: forecast.forecastGeneratedAt,
        updatedAt: forecast.forecastGeneratedAt,
      }),
    );

  return [overall, ...risky];
}

export function indexConversationHistory(history: QueryResult[]): IndexedObject[] {
  return history.map((entry) =>
    makeObject("conversation", {
      id: entry.id,
      title: entry.question,
      description: entry.answer,
      keywords: [entry.question, entry.intent],
      tags: [entry.intent],
      metadata: { intent: entry.intent },
      createdAt: entry.createdAt,
      updatedAt: entry.createdAt,
    }),
  );
}

export function indexExplanations(explanations: Explanation[]): IndexedObject[] {
  return explanations.map((e) =>
    makeObject("explanation", {
      id: e.id,
      title: e.title,
      description: e.reason,
      keywords: [e.title, e.objectType, ...e.tags],
      merchant: e.relatedObjects.find((r) => r.type === "merchant")?.label,
      category: e.relatedObjects.find((r) => r.type === "category")?.label,
      tags: e.tags,
      metadata: { objectType: e.objectType, objectId: e.objectId, confidence: e.confidence },
      createdAt: e.generatedAt,
      updatedAt: e.lastUpdated,
    }),
  );
}

/**
 * Constructs a fresh FinancialIndex from every source the app already
 * computes — nothing here re-derives numbers the underlying engines own;
 * it only reshapes their output into uniform, keyword-searchable records.
 */
export function buildFinancialIndex(sources: FinancialIndexSources): FinancialIndex {
  const objects: IndexedObject[] = [
    ...indexTransactions(sources.transactions),
    ...indexMerchants(sources.merchants),
    ...indexMerchantProfiles(sources.merchantProfiles),
    ...indexCategories(sources.insights, sources.now),
    ...indexTimelineEntries(sources.timeline, sources.now),
    ...indexBudgets(sources.budgets, sources.now),
    ...indexFinancialEvents(sources.events),
    ...indexRecommendations(sources.recommendations),
    ...indexRecurringTransactions(sources.recurring),
    ...indexForecastSummary(sources.forecast),
    ...indexConversationHistory(sources.conversationHistory),
    ...indexExplanations(sources.explanations),
  ];

  const counts = {} as Record<IndexObjectType, number>;
  for (const obj of objects) {
    counts[obj.type] = (counts[obj.type] ?? 0) + 1;
  }

  return { objects, generatedAt: sources.now.toISOString(), counts };
}
