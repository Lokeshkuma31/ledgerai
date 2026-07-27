import type { NotificationCandidate, PolicyStatistics } from "@/types/policy";

const GENERATED_DECISIONS = new Set([
  "notify-immediately",
  "schedule-later",
  "include-in-daily-briefing",
  "include-in-weekly-summary",
]);
const SUPPRESSED_DECISIONS = new Set(["silent", "dismiss"]);

function distinctDayCount(candidates: NotificationCandidate[]): number {
  const days = new Set(candidates.map((c) => c.createdAt.slice(0, 10)));
  return Math.max(1, days.size);
}

/**
 * Deterministic aggregate stats over an already-evaluated candidate set.
 * Mirrors lib/feed/statistics.ts's approach: plain reduction over the
 * persisted array, no LLM, no estimation.
 */
export function computePolicyStatistics(candidates: NotificationCandidate[]): PolicyStatistics {
  const notificationsGenerated = candidates.filter((c) => GENERATED_DECISIONS.has(c.policyDecision)).length;
  const notificationsSuppressed = candidates.filter((c) => SUPPRESSED_DECISIONS.has(c.policyDecision)).length;

  const ruleCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const ruleName = candidate.metadata.ruleName;
    if (typeof ruleName !== "string") continue;
    ruleCounts.set(ruleName, (ruleCounts.get(ruleName) ?? 0) + 1);
  }
  let mostTriggeredRule: string | null = null;
  let mostTriggeredCount = 0;
  for (const [ruleName, count] of ruleCounts) {
    if (count > mostTriggeredCount) {
      mostTriggeredRule = ruleName;
      mostTriggeredCount = count;
    }
  }

  const highestPriorityAlert =
    candidates.length === 0 ? null : candidates.reduce((max, c) => (c.priority > max.priority ? c : max));

  const cooldownHits = candidates.filter((c) => c.reason.includes("cooldown window")).length;
  const policyOverrides = candidates.filter((c) => c.metadata.overriddenDecision !== undefined).length;

  return {
    notificationsGenerated,
    notificationsSuppressed,
    averageDailyNotifications:
      candidates.length === 0
        ? 0
        : Math.round((notificationsGenerated / distinctDayCount(candidates)) * 100) / 100,
    mostTriggeredRule,
    highestPriorityAlert,
    cooldownHits,
    policyOverrides,
  };
}
