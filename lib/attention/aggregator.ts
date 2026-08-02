import type { ConnectionRecord } from "@/lib/connections/types";
import type { AttentionItem } from "@/types/attention";
import type { BudgetStatus } from "@/types/budget";
import type { FeedItem, FeedSeverity } from "@/types/feed";
import type { RecurringTransaction } from "@/types/recurring";

const SEVERITY_RANK: Record<FeedSeverity, number> = {
  critical: 4,
  important: 3,
  warning: 2,
  info: 1,
  positive: 0,
};

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function budgetItems(budgets: BudgetStatus[]): AttentionItem[] {
  return budgets
    .filter((b) => b.status === "exceeded" || b.status === "warning")
    .map((b) => ({
      id: `budget:${b.id}`,
      domain: "budget",
      severity: b.status === "exceeded" ? "critical" : "warning",
      title: b.status === "exceeded" ? `Over budget: ${b.category}` : `Approaching limit: ${b.category}`,
      summary: `${formatAmount(b.currentSpend)} of ${formatAmount(b.monthlyLimit)} spent (${Math.round(b.percentageUsed)}%) · ${b.daysRemainingThisMonth} day${b.daysRemainingThisMonth === 1 ? "" : "s"} left this month`,
      ctaHref: "/budgets",
      ctaLabel: "Review budget",
      relatedObjectIds: [b.id],
    }));
}

function recurringItems(recurring: RecurringTransaction[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const r of recurring) {
    if (r.status === "Missed") {
      items.push({
        id: `recurring:${r.id}`,
        domain: "bill",
        severity: "important",
        title: `Missed payment: ${r.title}`,
        summary: `Expected around ${r.averageAmount ? formatAmount(r.averageAmount) : "the usual amount"} — no matching transaction found yet.`,
        ctaHref: "/recurring",
        ctaLabel: "Review",
        relatedObjectIds: [r.id],
      });
    } else if (r.status === "Upcoming" && r.daysRemaining !== null && r.daysRemaining <= 3) {
      items.push({
        id: `recurring:${r.id}`,
        domain: "bill",
        severity: "info",
        title: `Bill due soon: ${r.title}`,
        summary: `${formatAmount(r.averageAmount)} due in ${r.daysRemaining === 0 ? "less than a day" : `${r.daysRemaining} day${r.daysRemaining === 1 ? "" : "s"}`}.`,
        ctaHref: "/recurring",
        ctaLabel: "View bills",
        relatedObjectIds: [r.id],
      });
    }
  }
  return items;
}

const CONNECTION_SEVERITY: Partial<Record<ConnectionRecord["health"]["status"], FeedSeverity>> = {
  warning: "warning",
  "expired-token": "warning",
  "permission-revoked": "important",
  "authentication-failed": "critical",
};

function connectionItems(connections: ConnectionRecord[]): AttentionItem[] {
  return connections
    .map((c) => {
      const severity = CONNECTION_SEVERITY[c.health.status];
      if (!severity) return null;
      const item: AttentionItem = {
        id: `connection:${c.id}`,
        domain: "connection",
        severity,
        title: `${c.displayName || c.email || c.provider} needs attention`,
        summary: c.health.message,
        ctaHref: "/connections",
        ctaLabel: "Fix connection",
        relatedObjectIds: [c.id],
      };
      return item;
    })
    .filter((item): item is AttentionItem => item !== null);
}

const FEED_SOURCE_HREF: Record<string, string> = {
  budget: "/budgets",
  recurring: "/recurring",
  forecast: "/forecast",
  merchant: "/merchants",
  events: "/insights",
  decision: "/ai-coach",
  timeline: "/feed",
  insights: "/insights",
  feed: "/feed",
};

/** Feed items already surfaced more precisely above (budget-warning,
 * subscription-renewal) are excluded here to avoid double-counting the
 * same underlying signal from two sources. */
const EXCLUDED_FEED_TYPES = new Set(["budget-warning", "subscription-renewal"]);

function feedItems(feed: FeedItem[]): AttentionItem[] {
  return feed
    .filter(
      (item) =>
        !item.isDismissed &&
        (item.severity === "critical" || item.severity === "important") &&
        !EXCLUDED_FEED_TYPES.has(item.type),
    )
    .map((item) => ({
      id: `feed:${item.id}`,
      domain: "feed",
      severity: item.severity,
      title: item.title,
      summary: item.summary,
      ctaHref: FEED_SOURCE_HREF[item.sourceEngine] ?? "/feed",
      ctaLabel: "View details",
      relatedObjectIds: item.relatedObjectIds,
    }));
}

/**
 * Projects budget, recurring, connection, and Feed engine output into one
 * ranked list — the single source the Dashboard's "Needs Attention" section
 * reads from, so budget risk, upcoming bills, sync/connection issues, and
 * flagged feed items are ranked against each other instead of living in
 * separately-styled, unranked widgets.
 */
export function buildAttentionItems(input: {
  budgets: BudgetStatus[];
  recurring: RecurringTransaction[];
  feed: FeedItem[];
  connections: ConnectionRecord[];
}): AttentionItem[] {
  const items = [
    ...budgetItems(input.budgets),
    ...recurringItems(input.recurring),
    ...connectionItems(input.connections),
    ...feedItems(input.feed),
  ];
  return items.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}
