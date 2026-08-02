import { describe, expect, it } from "vitest";
import { buildAttentionItems } from "@/lib/attention/aggregator";
import type { ConnectionRecord } from "@/lib/connections/types";
import type { BudgetStatus } from "@/types/budget";
import type { FeedItem } from "@/types/feed";
import type { RecurringTransaction } from "@/types/recurring";

function budget(overrides: Partial<BudgetStatus>): BudgetStatus {
  return {
    id: "b1",
    category: "Food",
    monthlyLimit: 1000,
    currentSpend: 500,
    remainingAmount: 500,
    percentageUsed: 50,
    transactionCount: 3,
    daysRemainingThisMonth: 10,
    status: "safe",
    ...overrides,
  };
}

function recurring(overrides: Partial<RecurringTransaction>): RecurringTransaction {
  return {
    id: "r1",
    title: "Netflix",
    category: "Entertainment",
    frequency: "Monthly",
    averageAmount: 500,
    minimumAmount: 500,
    maximumAmount: 500,
    lastAmount: 500,
    lastOccurrence: "2026-07-01",
    nextExpectedOccurrence: "2026-08-01",
    daysRemaining: 5,
    confidence: 0.9,
    transactionCount: 6,
    isSubscription: true,
    isIncome: false,
    isExpense: true,
    status: "Active",
    relatedTransactionIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function connection(overrides: Partial<ConnectionRecord>): ConnectionRecord {
  return {
    id: "c1",
    provider: "google",
    providerAccountId: "acct1",
    displayName: "Personal Gmail",
    email: "user@gmail.com",
    status: "connected",
    connectedAt: "2026-01-01T00:00:00.000Z",
    lastValidated: "2026-07-01T00:00:00.000Z",
    lastActivity: "2026-07-01T00:00:00.000Z",
    scopes: [],
    tokenExpiresAt: "2026-08-01T00:00:00.000Z",
    health: { status: "healthy", message: "All good", checkedAt: "2026-07-01T00:00:00.000Z" },
    history: [],
    metadata: {},
    ...overrides,
  };
}

function feedItem(overrides: Partial<FeedItem>): FeedItem {
  return {
    id: "f1",
    type: "system-insight",
    title: "Insight",
    summary: "Something happened",
    priority: 50,
    severity: "info",
    sourceEngine: "insights",
    relatedObjectIds: [],
    explanationId: null,
    confidence: 0.8,
    createdAt: "2026-07-01T00:00:00.000Z",
    expiresAt: null,
    isRead: false,
    isPinned: false,
    isDismissed: false,
    metadata: {},
    ...overrides,
  };
}

describe("buildAttentionItems", () => {
  it("returns nothing when everything is healthy", () => {
    const result = buildAttentionItems({
      budgets: [budget({ status: "safe" })],
      recurring: [recurring({ status: "Active" })],
      feed: [feedItem({ severity: "positive" })],
      connections: [connection({})],
    });
    expect(result).toEqual([]);
  });

  it("flags exceeded budgets as critical and warning budgets as warning", () => {
    const result = buildAttentionItems({
      budgets: [
        budget({ id: "over", category: "Shopping", status: "exceeded", percentageUsed: 120 }),
        budget({ id: "near", category: "Food", status: "warning", percentageUsed: 85 }),
      ],
      recurring: [],
      feed: [],
      connections: [],
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "budget:over", severity: "critical", domain: "budget" });
    expect(result[1]).toMatchObject({ id: "budget:near", severity: "warning", domain: "budget" });
  });

  it("flags missed recurring payments and soon-due bills, but not distant upcoming ones", () => {
    const result = buildAttentionItems({
      budgets: [],
      recurring: [
        recurring({ id: "missed", status: "Missed", title: "Rent" }),
        recurring({ id: "soon", status: "Upcoming", daysRemaining: 2, title: "Electricity" }),
        recurring({ id: "later", status: "Upcoming", daysRemaining: 20, title: "Insurance" }),
      ],
      feed: [],
      connections: [],
    });
    const ids = result.map((r) => r.id);
    expect(ids).toContain("recurring:missed");
    expect(ids).toContain("recurring:soon");
    expect(ids).not.toContain("recurring:later");
    expect(result.find((r) => r.id === "recurring:missed")?.severity).toBe("important");
  });

  it("flags unhealthy connections but not healthy or disconnected ones", () => {
    const result = buildAttentionItems({
      budgets: [],
      recurring: [],
      feed: [],
      connections: [
        connection({ id: "bad", health: { status: "authentication-failed", message: "Login expired", checkedAt: "" } }),
        connection({ id: "fine", health: { status: "healthy", message: "OK", checkedAt: "" } }),
        connection({ id: "gone", status: "disconnected", health: { status: "disconnected", message: "Disconnected", checkedAt: "" } }),
      ],
    });
    const ids = result.map((r) => r.id);
    expect(ids).toEqual(["connection:bad"]);
    expect(result[0].severity).toBe("critical");
  });

  it("includes critical/important feed items but excludes budget-warning and subscription-renewal types to avoid double-counting", () => {
    const result = buildAttentionItems({
      budgets: [],
      recurring: [],
      feed: [
        feedItem({ id: "keep", severity: "critical", type: "large-expense" }),
        feedItem({ id: "dup1", severity: "critical", type: "budget-warning" }),
        feedItem({ id: "dup2", severity: "important", type: "subscription-renewal" }),
        feedItem({ id: "low", severity: "info", type: "system-insight" }),
        feedItem({ id: "dismissed", severity: "critical", type: "large-expense", isDismissed: true }),
      ],
      connections: [],
    });
    expect(result.map((r) => r.id)).toEqual(["feed:keep"]);
  });

  it("ranks all sources together by severity, most severe first", () => {
    const result = buildAttentionItems({
      budgets: [budget({ id: "warn-budget", status: "warning" })],
      recurring: [recurring({ id: "missed-bill", status: "Missed" })],
      feed: [feedItem({ id: "crit-feed", severity: "critical", type: "large-expense" })],
      connections: [
        connection({ id: "bad-conn", health: { status: "authentication-failed", message: "x", checkedAt: "" } }),
      ],
    });
    expect(result.map((r) => r.severity)).toEqual(["critical", "critical", "important", "warning"]);
  });
});
