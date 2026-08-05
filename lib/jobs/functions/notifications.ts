/**
 * Notification generation job — subscribes to the feed/workflow/budget/
 * recurring/recommendation completion events that can produce something
 * worth notifying about. Orchestrates lib/policy/engine.ts::
 * evaluateNotificationPolicy (unchanged) for rule/quiet-hours/schedule-type
 * decisions, then gates persistence against the *real* Postgres cooldown
 * state (services/notifications/notification-service.ts) rather than that
 * engine's own window-guarded (localStorage) cooldown check — see
 * lib/policy/cooldown.ts's cooldownWindowFor (pure, reused as-is) and
 * docs/job-platform/07-idempotency-design.md's Notifications section.
 *
 * Known scope limit: evaluateNotificationPolicy's internal daily-budget
 * counter (maxNotificationsPerDay) reads the same window-guarded registry
 * and is not authoritative when run server-side — the real cooldown gate
 * below is what actually prevents duplicate/excessive firing; the budget
 * cap is best-effort until that engine is revisited.
 */
import { defineJob } from "@/lib/jobs/worker";
import { dispatch } from "@/lib/jobs/dispatcher";
import { buildKey } from "@/lib/jobs/idempotency";
import { orgConcurrency, globalConcurrency } from "@/lib/jobs/queue";
import { evaluateNotificationPolicy } from "@/lib/policy/engine";
import { cooldownWindowFor } from "@/lib/policy/cooldown";
import * as feedService from "@/services/feed/feed-service";
import * as notificationService from "@/services/notifications/notification-service";
import type { EventPayload } from "@/lib/jobs/events";
import type { FeedItemType } from "@/types/feed";

type Trigger =
  | EventPayload<"ledger/feed.generated">
  | EventPayload<"ledger/workflow.completed">
  | EventPayload<"ledger/sync.failed">
  | EventPayload<"ledger/budget.updated">
  | EventPayload<"ledger/recurring.detected">
  | EventPayload<"ledger/recommendation.generated">;

function contentSignature(candidate: { priority: number; severity: string; summary: string }): string {
  return `${candidate.priority}:${candidate.severity}:${candidate.summary}`;
}

export const notificationGenerate = defineJob<Trigger>(
  {
    id: "notification-generate",
    name: "Notification Generation",
    trigger: [
      { event: "ledger/feed.generated" },
      { event: "ledger/workflow.completed" },
      { event: "ledger/sync.failed" },
      { event: "ledger/budget.updated" },
      { event: "ledger/recurring.detected" },
      { event: "ledger/recommendation.generated" },
    ],
    concurrency: [orgConcurrency(5), globalConcurrency(30)],
  },
  async ({ organizationId, correlationId, step }) => {
    if (!organizationId) return { skipped: true };
    const now = new Date();

    const [feed, preferences] = await step.run("load-context", () =>
      Promise.all([feedService.listFeedItems(organizationId), notificationService.getPreferences(organizationId)]),
    );

    const candidates = await step.run("evaluate", () => evaluateNotificationPolicy({ feed, preferences, now }));

    let created = 0;
    for (const candidate of candidates) {
      const accepted = await step.run(`gate-${candidate.id}`, async () => {
        const feedItemType = candidate.metadata.feedItemType as FeedItemType | undefined;
        const windowMs = feedItemType ? cooldownWindowFor(feedItemType) : 12 * 60 * 60 * 1000;
        const signature = contentSignature(candidate);

        const state = await notificationService.getCooldownState(organizationId, candidate.cooldownKey);
        const suppressed =
          state !== undefined &&
          (now.getTime() - new Date(state.lastFiredAt).getTime() < windowMs || state.lastContentSignature === signature);
        if (suppressed) return false;

        await notificationService.upsertCandidate(organizationId, candidate);
        if (candidate.policyDecision === "notify-immediately" || candidate.policyDecision === "schedule-later") {
          await notificationService.recordFiring(organizationId, candidate.cooldownKey, signature, now);
        }
        return true;
      });

      if (!accepted) continue;
      created += 1;
      await dispatch(
        "ledger/notification.created",
        { organizationId, correlationId, notificationCandidateId: candidate.id, policyDecision: candidate.policyDecision },
        { id: buildKey("notification-created", candidate.id) },
      );
    }

    return { evaluated: candidates.length, created };
  },
);
