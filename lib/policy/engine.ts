import { cooldownWindowFor, isSuppressedByCooldown, recordFiring } from "@/lib/policy/cooldown";
import { isWithinQuietHours, quietHoursEndTime } from "@/lib/policy/preferences";
import { getAllCandidates, reconcileCandidates } from "@/lib/policy/registry";
import { applyPreferenceGate, evaluateRules, type RuleOutcome } from "@/lib/policy/rules";
import { computeRecommendedTime, pickDailyBriefingScheduleType } from "@/lib/policy/scheduler";
import type { FeedItem } from "@/types/feed";
import type { NotificationCandidate, NotificationPreferences, PolicyDecision } from "@/types/policy";

const URGENT_DECISIONS: PolicyDecision[] = ["notify-immediately", "schedule-later"];
const SCHEDULED_DECISIONS: PolicyDecision[] = [
  "notify-immediately",
  "schedule-later",
  "include-in-daily-briefing",
  "include-in-weekly-summary",
];

export interface EvaluateNotificationPolicyInput {
  /** Financial Intelligence Feed output — the primary, already-deduplicated
   * and prioritized source this engine reasons over. */
  feed: FeedItem[];
  preferences: NotificationPreferences;
  now?: Date;
}

function contentSignature(item: FeedItem): string {
  return `${item.type}:${item.severity}:${item.priority}:${item.summary}`;
}

function isToday(iso: string, now: Date): boolean {
  return iso.slice(0, 10) === now.toISOString().slice(0, 10);
}

function buildCandidate(
  item: FeedItem,
  outcome: RuleOutcome,
  now: Date,
  preferences: NotificationPreferences,
  overrideTime?: Date,
): NotificationCandidate {
  const recommendedTime = SCHEDULED_DECISIONS.includes(outcome.decision)
    ? (overrideTime ?? new Date(computeRecommendedTime(outcome.scheduleType, now))).toISOString()
    : null;

  const channels = outcome.channels.filter((channel) => preferences.preferredChannels.includes(channel));

  return {
    id: `policy:${item.id}`,
    title: item.title,
    summary: item.summary,
    priority: item.priority,
    severity: item.severity,
    reason: outcome.reason,
    sourceEngine: item.sourceEngine,
    relatedObjectIds: item.relatedObjectIds,
    recommendedChannels: channels,
    recommendedTime,
    expiresAt: item.expiresAt,
    cooldownKey: item.id,
    confidence: item.confidence,
    policyDecision: outcome.decision,
    metadata: { ruleName: outcome.ruleName, feedItemId: item.id, feedItemType: item.type },
    createdAt: now.toISOString(),
  };
}

/**
 * Automation & Notification Policy Engine — the single entry point that
 * decides, for every active Financial Intelligence Feed item, whether it
 * deserves the user's attention, when, and through which channels. Never
 * sends anything: the result is a deterministic set of recommendations
 * for future delivery systems (push, email, widgets) to consume.
 *
 * Order of operations per item: rules decide a raw outcome -> the user's
 * category preferences can downgrade it to Silent -> cooldown can suppress
 * a repeat firing -> the daily notification cap can defer it to the next
 * briefing -> quiet hours can push an immediate notification past the
 * quiet window. Each step only narrows what the previous one decided.
 */
export function evaluateNotificationPolicy(input: EvaluateNotificationPolicyInput): NotificationCandidate[] {
  const now = input.now ?? new Date();
  const preferences = input.preferences;

  // How many urgent-tier candidates already fired today, per the
  // persisted registry — avoids a separate counter that could drift from
  // the registry's own state.
  const firedTodayCount = getAllCandidates().filter(
    (c) => URGENT_DECISIONS.includes(c.policyDecision) && isToday(c.createdAt, now),
  ).length;
  let remainingBudget = Math.max(0, preferences.maxNotificationsPerDay - firedTodayCount);

  const activeItems = [...input.feed]
    .filter((item) => !item.isDismissed)
    .sort((a, b) => b.priority - a.priority);

  const candidates = activeItems.map((item) => {
    if (item.expiresAt && item.expiresAt <= now.toISOString()) {
      return buildCandidate(
        item,
        {
          decision: "expired",
          channels: [],
          scheduleType: "custom",
          reason: "This item's window has already passed.",
          category: null,
          ruleName: "expired",
        },
        now,
        preferences,
      );
    }

    let outcome = applyPreferenceGate(evaluateRules(item, now), preferences);
    const signature = contentSignature(item);
    let deferredTime: Date | undefined;

    if (URGENT_DECISIONS.includes(outcome.decision)) {
      const windowMs = cooldownWindowFor(item.type);
      if (isSuppressedByCooldown(item.id, signature, windowMs, now)) {
        outcome = {
          ...outcome,
          decision: "silent",
          channels: [],
          reason: `${outcome.reason} (suppressed — repeats within its cooldown window.)`,
        };
      } else if (remainingBudget <= 0) {
        outcome = {
          ...outcome,
          decision: "include-in-daily-briefing",
          scheduleType: pickDailyBriefingScheduleType(now),
          channels: ["dashboard-feed"],
          reason: `${outcome.reason} (deferred to your daily briefing — today's notification limit was reached.)`,
        };
      } else {
        recordFiring(item.id, signature, now);
        remainingBudget -= 1;
      }
    }

    if (outcome.decision === "notify-immediately" && isWithinQuietHours(preferences, now)) {
      deferredTime = quietHoursEndTime(preferences, now);
      outcome = {
        ...outcome,
        decision: "schedule-later",
        reason: `${outcome.reason} (deferred past quiet hours.)`,
      };
    }

    return buildCandidate(item, outcome, now, preferences, deferredTime);
  });

  return reconcileCandidates(candidates);
}
