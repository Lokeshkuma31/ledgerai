import type { FeedItemType, FeedSeverity, FeedSourceEngine } from "@/types/feed";

export const POLICY_DECISIONS = [
  "notify-immediately",
  "schedule-later",
  "include-in-daily-briefing",
  "include-in-weekly-summary",
  "silent",
  "dismiss",
  "expired",
] as const;
export type PolicyDecision = (typeof POLICY_DECISIONS)[number];

export const NOTIFICATION_CHANNELS = [
  "push",
  "email",
  "dashboard-feed",
  "home-widget",
  "desktop",
  "watch",
  "voice-assistant",
] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const SCHEDULE_TYPES = [
  "immediate",
  "morning-briefing",
  "evening-briefing",
  "weekly-summary",
  "monthly-summary",
  "custom",
] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

/**
 * One notification candidate — a deterministic recommendation about whether
 * and how a feed item deserves the user's attention. Produced by
 * lib/policy/engine.ts. This is never a notification itself: no channel in
 * `recommendedChannels` is ever actually delivered through by this engine.
 */
export interface NotificationCandidate {
  id: string;
  title: string;
  summary: string;
  /** 0-100, carried over from the source FeedItem. */
  priority: number;
  severity: FeedSeverity;
  /** Plain-language explanation of why this decision/channel set was chosen. */
  reason: string;
  sourceEngine: FeedSourceEngine;
  relatedObjectIds: string[];
  recommendedChannels: NotificationChannel[];
  /** ISO 8601 — when delivery is recommended. Null when the decision doesn't
   * call for any delivery (silent/dismiss/expired). */
  recommendedTime: string | null;
  /** ISO 8601 — null means it never auto-expires. */
  expiresAt: string | null;
  /** Groups candidates that represent "the same situation" for cooldown
   * suppression purposes — e.g. `budget:Food`, shared across regenerations
   * even as the candidate's other fields change. */
  cooldownKey: string;
  confidence: number; // 0-1
  policyDecision: PolicyDecision;
  /** `metadata.originalDecision` / `metadata.overriddenDecision` record a
   * user's manual override (see lib/policy/registry.ts's overrideDecision)
   * without growing the model beyond this fixed field set. */
  metadata: Record<string, unknown>;
  /** ISO 8601 — preserved across regenerations once persisted. */
  createdAt: string;
}

export interface QuietHours {
  enabled: boolean;
  /** "HH:MM", 24-hour, local time. */
  start: string;
  /** "HH:MM", 24-hour, local time. May be earlier than `start` — an
   * overnight window (e.g. 22:00-07:00) wraps past midnight. */
  end: string;
}

/**
 * User-configurable notification preferences. A single persisted object
 * (see lib/policy/preferences.ts), not a collection — mirrors how Budgets
 * or Coach cache use one record rather than a registry of many.
 */
export interface NotificationPreferences {
  budgetAlerts: boolean;
  forecastAlerts: boolean;
  subscriptionAlerts: boolean;
  achievements: boolean;
  merchantInsights: boolean;
  weeklyDigest: boolean;
  monthlyDigest: boolean;
  quietHours: QuietHours;
  preferredChannels: NotificationChannel[];
  maxNotificationsPerDay: number;
}

/** Which preference category gates a given feed item type — used by
 * lib/policy/rules.ts to silence a whole category the user has turned off. */
export type PolicyCategory =
  | "budgetAlerts"
  | "forecastAlerts"
  | "subscriptionAlerts"
  | "achievements"
  | "merchantInsights"
  | "weeklyDigest"
  | "monthlyDigest";

export interface PolicyStatistics {
  notificationsGenerated: number;
  notificationsSuppressed: number;
  averageDailyNotifications: number;
  mostTriggeredRule: string | null;
  highestPriorityAlert: NotificationCandidate | null;
  cooldownHits: number;
  policyOverrides: number;
}

/** What the AI Financial Coach receives — already-decided policy outcomes.
 * The Coach summarizes these; it never decides notification policy itself. */
export interface PolicyCoachSummary {
  pendingCandidates: {
    title: string;
    summary: string;
    priority: number;
    policyDecision: PolicyDecision;
  }[];
  suppressedCount: number;
  dailyBriefingCandidates: {
    title: string;
    summary: string;
  }[];
}

/** Re-exported for callers that only need the shape a rule reasons about,
 * without importing the full Feed type surface. */
export type { FeedItemType, FeedSeverity, FeedSourceEngine };
