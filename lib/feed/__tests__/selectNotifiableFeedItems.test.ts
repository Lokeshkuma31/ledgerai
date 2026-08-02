import { describe, expect, it } from "vitest";
import { selectNotifiableFeedItems } from "@/lib/feed/selectNotifiableFeedItems";
import type { FeedItem } from "@/types/feed";
import type { NotificationCandidate } from "@/types/policy";

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

function candidate(overrides: Partial<NotificationCandidate>): NotificationCandidate {
  return {
    id: "c1",
    title: "Insight",
    summary: "Something happened",
    priority: 50,
    severity: "info",
    reason: "because",
    sourceEngine: "insights",
    relatedObjectIds: [],
    recommendedChannels: [],
    recommendedTime: null,
    expiresAt: null,
    cooldownKey: "key",
    confidence: 0.8,
    policyDecision: "silent",
    metadata: {},
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("selectNotifiableFeedItems", () => {
  it("returns nothing when no candidate was decided notify-immediately", () => {
    const items = [feedItem({ id: "a" })];
    const candidates = [candidate({ metadata: { feedItemId: "a" }, policyDecision: "silent" })];
    expect(selectNotifiableFeedItems(items, candidates)).toEqual([]);
  });

  it("selects only feed items whose candidate was decided notify-immediately", () => {
    const items = [feedItem({ id: "a" }), feedItem({ id: "b" }), feedItem({ id: "c" })];
    const candidates = [
      candidate({ metadata: { feedItemId: "a" }, policyDecision: "notify-immediately" }),
      candidate({ metadata: { feedItemId: "b" }, policyDecision: "schedule-later" }),
    ];
    const result = selectNotifiableFeedItems(items, candidates);
    expect(result.map((i) => i.id)).toEqual(["a"]);
  });

  it("excludes dismissed feed items even if their candidate says notify-immediately", () => {
    const items = [feedItem({ id: "a", isDismissed: true })];
    const candidates = [candidate({ metadata: { feedItemId: "a" }, policyDecision: "notify-immediately" })];
    expect(selectNotifiableFeedItems(items, candidates)).toEqual([]);
  });

  it("sorts by priority, highest first", () => {
    const items = [
      feedItem({ id: "low", priority: 10 }),
      feedItem({ id: "high", priority: 90 }),
      feedItem({ id: "mid", priority: 50 }),
    ];
    const candidates = ["low", "high", "mid"].map((id) =>
      candidate({ metadata: { feedItemId: id }, policyDecision: "notify-immediately" }),
    );
    const result = selectNotifiableFeedItems(items, candidates);
    expect(result.map((i) => i.id)).toEqual(["high", "mid", "low"]);
  });

  it("respects the limit", () => {
    const items = [feedItem({ id: "a" }), feedItem({ id: "b" }), feedItem({ id: "c" })];
    const candidates = ["a", "b", "c"].map((id) =>
      candidate({ metadata: { feedItemId: id }, policyDecision: "notify-immediately" }),
    );
    expect(selectNotifiableFeedItems(items, candidates, 2)).toHaveLength(2);
  });

  it("ignores candidates with a non-string or missing feedItemId in metadata", () => {
    const items = [feedItem({ id: "a" })];
    const candidates = [candidate({ metadata: { feedItemId: 123 }, policyDecision: "notify-immediately" })];
    expect(selectNotifiableFeedItems(items, candidates)).toEqual([]);
  });
});
