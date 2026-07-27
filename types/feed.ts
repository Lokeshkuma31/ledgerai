export const FEED_ITEM_TYPES = [
  "budget-warning",
  "budget-recovered",
  "forecast-update",
  "large-expense",
  "unusual-spending",
  "new-subscription",
  "subscription-renewal",
  "salary-received",
  "salary-expected",
  "savings-milestone",
  "merchant-insight",
  "category-trend",
  "cash-flow-change",
  "recommendation",
  "achievement",
  "weekly-summary",
  "monthly-summary",
  "system-insight",
] as const;
export type FeedItemType = (typeof FEED_ITEM_TYPES)[number];

/** A superset of FinancialEventSeverity ("positive" is added) — the Feed
 * aggregates good news (achievements, recovered budgets) alongside risk
 * signals, which the events taxonomy alone doesn't have a tier for. */
export const FEED_SEVERITIES = ["positive", "info", "warning", "important", "critical"] as const;
export type FeedSeverity = (typeof FEED_SEVERITIES)[number];

/** Which deterministic engine's output this item was generated from. "feed"
 * marks items the Feed Engine itself derives directly (weekly/monthly
 * summaries, system insights) rather than relaying another engine's output. */
export const FEED_SOURCE_ENGINES = [
  "budget",
  "events",
  "decision",
  "recurring",
  "forecast",
  "merchant",
  "timeline",
  "insights",
  "feed",
] as const;
export type FeedSourceEngine = (typeof FEED_SOURCE_ENGINES)[number];

/**
 * One entry in the Financial Intelligence Feed. Generated deterministically
 * by lib/feed/engine.ts — never by an LLM. The AI Financial Coach only
 * summarizes/explains these; it never creates one.
 */
export interface FeedItem {
  id: string;
  type: FeedItemType;
  title: string;
  summary: string;
  /** 0-100 deterministic score from lib/feed/prioritizer.ts — higher surfaces first. */
  priority: number;
  severity: FeedSeverity;
  sourceEngine: FeedSourceEngine;
  relatedObjectIds: string[];
  /** `${ExplainableObjectType}:${objectId}` matching the Explanation Engine's
   * id scheme (see types/explanation.ts) — null when nothing explainable
   * backs this item (e.g. a Weekly Summary). */
  explanationId: string | null;
  confidence: number; // 0-1
  /** ISO 8601 — preserved across regenerations once persisted (see lib/feed/registry.ts). */
  createdAt: string;
  /** ISO 8601 — null means it never auto-expires. */
  expiresAt: string | null;
  isRead: boolean;
  isPinned: boolean;
  isDismissed: boolean;
  metadata: Record<string, unknown>;
}

export const FEED_TIMELINE_BUCKETS = ["today", "yesterday", "thisWeek", "earlier"] as const;
export type FeedTimelineBucketKey = (typeof FEED_TIMELINE_BUCKETS)[number];

export interface FeedTimelineGroup {
  key: FeedTimelineBucketKey;
  label: string;
  items: FeedItem[];
}

export interface FeedFilterOptions {
  priorityMin?: number;
  severities?: FeedSeverity[];
  sourceEngines?: FeedSourceEngine[];
  /** Case-insensitive match against metadata.merchant. */
  merchant?: string;
  /** Case-insensitive match against metadata.category. */
  category?: string;
  unreadOnly?: boolean;
  pinnedOnly?: boolean;
  /** Inclusive "YYYY-MM-DD" range applied to createdAt's calendar date. */
  startDate?: string;
  endDate?: string;
}

export interface FeedStatistics {
  unreadCount: number;
  criticalCount: number;
  dismissedCount: number;
  pinnedCount: number;
  /** Non-dismissed item count divided by the number of distinct calendar
   * days those items span (minimum 1). */
  averageDailyInsights: number;
  mostCommonType: FeedItemType | null;
  highestPriorityItem: FeedItem | null;
}

/** What the AI Financial Coach receives — trimmed, already-prioritized feed
 * items. The Coach summarizes/explains these; it never generates feed items
 * itself. */
export interface FeedCoachSummary {
  type: FeedItemType;
  title: string;
  summary: string;
  priority: number;
  severity: FeedSeverity;
  sourceEngine: FeedSourceEngine;
}
