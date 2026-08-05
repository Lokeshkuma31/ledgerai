# 6. Scheduling Strategy

## 6.1 Registration model

`lib/jobs/scheduler.ts` exposes one function, `registerSchedule()`, which wraps Inngest's native `{ cron: "..." }` trigger into a `createFunction` definition. Domain modules call it from their own files under `lib/jobs/functions/<domain>.ts`, and `registry.ts` aggregates every domain file's exports into the flat list passed to `serve()` — so **the core scheduler file never lists individual schedules**, satisfying "allow event handlers and providers to register their own schedules without modifying the core scheduler":

```ts
// lib/jobs/scheduler.ts — shape, not final code
export function registerSchedule(opts: {
  id: string;
  cron: string;         // standard 5-field cron, UTC
  dispatch: (ctx) => Promise<void> | void; // usually: dispatcher.dispatch(event, data)
}) {
  return inngest.createFunction({ id: opts.id, retries: 2 }, { cron: opts.cron }, opts.dispatch);
}

// lib/jobs/functions/recurring.ts — a domain file, not the core scheduler
export const recurringDetectSchedule = registerSchedule({
  id: "schedule-recurring-detect",
  cron: "0 3 * * *",
  dispatch: () => dispatcher.dispatchToAllOrgs("ledger/recurring.detect.requested"),
});
```

All cron expressions are UTC (Inngest's default) — org-local-time schedules (briefings) are handled by an **hourly tick that filters**, not by a per-org cron (Inngest cron triggers aren't parameterizable per-tenant), described in §6.3.

## 6.2 Global (non-tenant-local) schedule table

| Schedule id | Cron | Cadence | Dispatches | Notes |
|---|---|---|---|---|
| `schedule-email-sync-poll` | `*/15 * * * *` | every 15 min | `ledger/sync.started` (runType=`SCHEDULED`, `providerCategory=EMAIL_IMPORT`) fanned out per `CONNECTED` connection | Skips connections with an already-`RUNNING` `SyncJob` (mutex from [04](./04-queue-strategy.md) makes a duplicate dispatch a safe no-op regardless, this is just avoiding wasted event volume) |
| `schedule-bank-sync-poll` | `0 * * * *` | hourly | same, `providerCategory=BANK_SYNC` \| `ACCOUNT_AGGREGATOR` | Hourly (not 15 min) — bank/aggregator provider TOS and rate limits are typically stricter than email; revisit per-provider once real bank connectors are selected |
| `schedule-connection-validate` | `0 * * * *` | hourly | `ledger/connection.validation.requested` per active `Connection` | Matches the hour-bucket dedup key in [02](./02-event-catalog.md) |
| `schedule-plugin-health` | `*/30 * * * *` | every 30 min | `ledger/plugin.health.requested` per enabled `PluginRegistryEntry` | |
| `schedule-recurring-detect` | `0 3 * * *` | daily, 03:00 UTC | recurring-detection trigger, fanned out per org | Low-traffic hour, ahead of the 04:00–06:00 chain below so `RecurringTransaction` state is fresh when forecast/budget/recommendation jobs read it |
| `schedule-forecast-refresh` | `0 4 * * *` | daily, 04:00 UTC | forecast-refresh trigger, per org | |
| `schedule-budget-recalculate` | `0 4 * * *` | daily, 04:00 UTC | budget-recalculate trigger, per org | Runs alongside forecast (independent, no ordering dependency between the two — both idempotent upserts) |
| `schedule-analytics-refresh` | `0 5 * * *` | daily, 05:00 UTC | analytics-refresh trigger, per org | After forecast/budget so daily analytics reflects same-day recalculated figures |
| `schedule-recommendation-generate` | `0 6 * * *` | daily, 06:00 UTC | recommendation-generate trigger, per org | After analytics, so recommendations can factor in freshly aggregated data |
| `schedule-search-index-sweep` | `0 6 * * *` | daily, 06:00 UTC | `ledger/search.indexed` reconciliation sweep (catches anything whose event-driven index dispatch failed silently) | Belt-and-suspenders catch-up, not the primary indexing path |
| `schedule-briefing-tick` | `0 * * * *` | hourly | `ledger/summary.requested` (filtered — see §6.3) | Single global cron; per-org fan-out logic lives in the function body, not in separate cron entries |
| `schedule-cleanup` | `0 2 * * *` | daily, 02:00 UTC | `ledger/cleanup.requested` (one event per `scope`) | Off-peak hour, ahead of the 03:00+ chain |
| `schedule-stale-job-reaper` | `*/10 * * * *` | every 10 min | no domain event — directly scans `JobRun` for rows `status=RUNNING` with `startedAt` older than a per-job-type timeout threshold, marks them `FAILED`, and routes through the same dead-letter path as a normal failure | Operational safety net for the case where a Vercel function instance is killed mid-run without Inngest's own failure path firing (rare, but the reason this exists — see [08](./08-worker-architecture.md) §8.5) |

## 6.3 Org-local-time schedules (briefings)

`BriefingDeliveryLog`'s unique key is `[organizationId, scheduleType, date]`, and `lib/policy/scheduler.ts` already computes per-org morning (08:00 local)/evening (19:00 local)/weekly/monthly briefing timing logic — this design reuses that logic rather than re-deriving it. Since Inngest cron is UTC-only and not per-tenant, `schedule-briefing-tick` fires every hour and the function body:

1. Queries orgs (via `UserPreferences`/org timezone field) whose **current local hour** matches a configured briefing hour.
2. For each match, checks `BriefingDeliveryLog` for an existing row with today's `date` for that `scheduleType` — if present, skips (idempotent no-op, not an error).
3. Otherwise dispatches `ledger/summary.requested` with `{ organizationId, scheduleType, date }`.

This keeps exactly one cron registration for all four briefing types (`MORNING_BRIEFING`, `EVENING_BRIEFING`, `WEEKLY_SUMMARY`, `MONTHLY_SUMMARY`) instead of four, with `WEEKLY_SUMMARY`/`MONTHLY_SUMMARY` additionally checking day-of-week/day-of-month before matching.

## 6.4 Interval vs. cron — when to use which

The task requires both. In practice, every schedule above is expressed as a cron string (Inngest's native trigger type) — "every 15 minutes" is `*/15 * * * *`, "hourly" is `0 * * * *`, etc. — because Inngest doesn't have a separate "interval" primitive distinct from cron; `registerSchedule()`'s `cron` parameter accepts both simple interval-shaped expressions and more complex custom expressions (e.g. a future "every 15 minutes but only 06:00–23:00 UTC" could be `*/15 6-23 * * *`) through the same interface, so no separate interval-vs-cron branching is needed in `scheduler.ts` itself.

## 6.5 Extensibility example

A future plugin that wants its own health-check cadence (distinct from the global `schedule-plugin-health`) registers its own schedule from its own module without editing `scheduler.ts` or `registry.ts`'s core logic — only adding one line to `registry.ts`'s aggregation import list:

```ts
// lib/plugins/some-plugin/schedule.ts
export const somePluginSchedule = registerSchedule({
  id: "schedule-some-plugin-custom-check",
  cron: "*/5 * * * *",
  dispatch: () => dispatcher.dispatch("ledger/plugin.health.requested", { pluginName: "some-plugin" }),
});

// lib/jobs/registry.ts
import { somePluginSchedule } from "@/lib/plugins/some-plugin/schedule";
export const functions = [...existingFunctions, somePluginSchedule];
```
