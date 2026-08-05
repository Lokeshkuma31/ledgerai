/**
 * Queue configuration builders — Inngest itself is the durable queue;
 * this module only composes the `concurrency`/`throttle`/`rateLimit`/
 * `priority` options every function in lib/jobs/functions/*.ts passes to
 * worker.ts's defineJob(). See docs/job-platform/04-queue-strategy.md.
 */
import type { InngestFunction } from "inngest";

type ConcurrencyOption = NonNullable<InngestFunction.Options["concurrency"]>;

/** Caps how many runs of a function execute at once *for a single
 * organization* — one noisy org can't starve every other tenant. See
 * docs/job-platform/04-queue-strategy.md §4.2. */
export function orgConcurrency(limit: number): { limit: number; key: string } {
  return { limit, key: "event.data.organizationId" };
}

/** Caps total in-flight runs of a function across every organization —
 * protects a shared downstream resource (the Postgres pool, a provider's
 * aggregate rate limit). */
export function globalConcurrency(limit: number): { limit: number } {
  return { limit };
}

/** A concurrency limit of 1 scoped to an arbitrary CEL key expression —
 * used as a mutex so only one run touching the same resource (e.g. one
 * sync per organization+provider) executes at a time. See
 * docs/job-platform/04-queue-strategy.md §4.2 and
 * docs/job-platform/07-idempotency-design.md's Sync Jobs section. */
export function mutex(key: string): { limit: 1; key: string } {
  return { limit: 1, key };
}

/** Combines an org-fairness limit with a global cap — the two-tier shape
 * most functions in the queue strategy table use. */
export function tieredConcurrency(orgLimit: number, globalLimit: number): ConcurrencyOption {
  return [orgConcurrency(orgLimit), globalConcurrency(globalLimit)];
}

/** Hard cap: excess events beyond `limit` per `period` are dropped, not
 * queued. Use where a repeat trigger within the window is genuinely
 * redundant (e.g. connection-validate). docs/job-platform/04-queue-strategy.md §4.5. */
export function hardRateLimit(limit: number, period: string, key?: string) {
  return { limit, period, key } as NonNullable<InngestFunction.Options["rateLimit"]>;
}

/** Soft cap: excess events queue up to `limit` per `period` rather than
 * being dropped — for provider API calls that must still eventually run,
 * just paced (e.g. sync-run's Gmail calls). */
export function throttle(limit: number, period: string, key?: string, burst?: number) {
  return { limit, period, key, burst } as NonNullable<InngestFunction.Options["throttle"]>;
}

/** Reorders queued runs ahead of default-priority ones — set only on
 * functions a user can be waiting on (sync-run, document-parse), gated by
 * `data.priority === "interactive"` set at dispatch time. See
 * docs/job-platform/04-queue-strategy.md §4.3. */
export const INTERACTIVE_PRIORITY = {
  run: "event.data.priority == 'interactive' ? 60 : 0",
} as NonNullable<InngestFunction.Options["priority"]>;
