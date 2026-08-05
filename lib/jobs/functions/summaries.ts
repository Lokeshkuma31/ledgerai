/**
 * Daily/weekly/monthly summary scheduling — one hourly cron tick, not
 * four separate per-schedule-type crons (Inngest cron is UTC-only and not
 * per-tenant; see docs/job-platform/06-scheduling-strategy.md §6.3). The
 * function body matches the current UTC hour against each schedule
 * type's target hour and fans out ledger/summary.requested per matching
 * org, gated by BriefingDeliveryLog's real unique constraint (checked as
 * the very first step, before any assembly work — see
 * docs/job-platform/07-idempotency-design.md's Briefings section).
 *
 * Every organization is treated as UTC until a real per-org timezone
 * column exists (see repositories/organization-repository.ts's comment).
 */
import { registerSchedule } from "@/lib/jobs/scheduler";
import { defineJob } from "@/lib/jobs/worker";
import { dispatch } from "@/lib/jobs/dispatcher";
import { buildKey, dayBucket } from "@/lib/jobs/idempotency";
import { globalConcurrency, orgConcurrency } from "@/lib/jobs/queue";
import { listActiveOrganizationIds } from "@/services/organizations/organization-service";
import * as briefingService from "@/services/briefings/briefing-service";
import type { ScheduleType } from "@/services/briefings/briefing-service";
import type { EventPayload } from "@/lib/jobs/events";

const MORNING_HOUR = 8;
const EVENING_HOUR = 19;

function matchingScheduleTypes(now: Date): ScheduleType[] {
  const hour = now.getUTCHours();
  const types: ScheduleType[] = [];
  if (hour === MORNING_HOUR) {
    types.push("MORNING_BRIEFING");
    if (now.getUTCDay() === 1) types.push("WEEKLY_SUMMARY"); // Monday
    if (now.getUTCDate() === 1) types.push("MONTHLY_SUMMARY"); // 1st of month
  }
  if (hour === EVENING_HOUR) types.push("EVENING_BRIEFING");
  return types;
}

export const briefingTick = registerSchedule(
  { id: "schedule-briefing-tick", name: "Briefing Schedule Tick", cron: "0 * * * *", retries: 1 },
  async ({ step }) => {
    const now = new Date();
    const scheduleTypes = matchingScheduleTypes(now);
    if (scheduleTypes.length === 0) return { dispatched: 0 };

    const orgIds = (await step.run("list-orgs", () => listActiveOrganizationIds())) as string[];
    let dispatched = 0;

    for (const organizationId of orgIds) {
      for (const scheduleType of scheduleTypes) {
        await step.run(`fanout-${organizationId}-${scheduleType}`, () =>
          dispatch(
            "ledger/summary.requested",
            { organizationId, scheduleType, date: dayBucket(now) },
            { id: buildKey("summary-requested", organizationId, scheduleType, dayBucket(now)) },
          ),
        );
        dispatched += 1;
      }
    }
    return { dispatched };
  },
);

export const summaryGenerate = defineJob<EventPayload<"ledger/summary.requested">>(
  {
    id: "summary-generate",
    name: "Summary Generation",
    trigger: { event: "ledger/summary.requested" },
    concurrency: [orgConcurrency(1), globalConcurrency(10)],
  },
  async ({ event, organizationId, step }) => {
    if (!organizationId) return { skipped: true };
    const { scheduleType, date } = event.data;

    // The real, authoritative idempotency gate — a duplicate dispatch (a
    // retried step, a re-sent event) is a cheap no-op here rather than
    // redoing assembly work and discarding it at write time.
    const isNew = await step.run("gate", () =>
      briefingService.recordDelivery(organizationId, scheduleType as ScheduleType, new Date(date)),
    );
    if (!isNew) return { skipped: true, reason: "already delivered" };

    // Delivery channel (email/push) is a deferred integration — see
    // docs/job-platform/09-migration-plan.md §9.4. The decision to notify
    // is now durably recorded (BriefingDeliveryLog); actual sending is
    // not yet wired.
    return { scheduleType, date, delivered: false };
  },
);
