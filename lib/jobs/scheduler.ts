/**
 * Scheduler — wraps Inngest's native `{ cron: "..." }` trigger so domain
 * modules can register their own schedules without editing this file or
 * registry.ts's aggregation logic beyond adding one import line. See
 * docs/job-platform/06-scheduling-strategy.md §6.1.
 */
import "server-only";
import { defineJob, type JobContext } from "./worker";

export interface RegisterScheduleConfig {
  /** Also JobRun.jobType and the Inngest function id. */
  id: string;
  name?: string;
  /** Standard 5-field cron, UTC — see docs/job-platform/06-scheduling-strategy.md §6.2. */
  cron: string;
  retries?: number;
}

/** Registers a cron-triggered job. The handler receives no meaningful
 * `event.data` (cron ticks carry no payload) — it's responsible for
 * fanning out to real domain events itself (e.g. dispatching
 * ledger/schedule.recurring-detect per organization), matching
 * docs/job-platform/06-scheduling-strategy.md §6.1's registerSchedule()
 * shape. */
export function registerSchedule(config: RegisterScheduleConfig, handler: (ctx: JobContext) => Promise<unknown>) {
  return defineJob(
    {
      id: config.id,
      name: config.name,
      trigger: { cron: config.cron },
      retries: config.retries ?? 2,
    },
    handler,
  );
}
