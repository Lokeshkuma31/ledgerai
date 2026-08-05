# 06 — Health Monitoring Design

## Status quo — read this before implementing anything

`lib/health/checks.ts` + `app/api/health/route.ts` + `app/api/readiness/route.ts` + `app/api/liveness/route.ts` **already exist and are already correct** in their current scope:

- `checkDatabase()` — `SELECT 1` via Prisma.
- `checkRedis()` — `redis.ping()`.
- `checkStorage()` — `HeadBucketCommand` against R2, `"unconfigured"` if R2 env vars absent.
- `checkOAuthProviders()` — **configuration-only** check (env vars present), deliberately not a live provider call, to avoid burning OAuth API quota on every poll. Covers Better Auth's Google client plus all three Connection Hub providers (Google, Microsoft, Yahoo).
- `checkBackgroundJobs()` — checks `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` presence; already updated (per its own comment history) to reflect that the job platform is fully wired, not just "not yet built."
- `/api/health` — aggregates all of the above, `200`/`healthy` only requires database+redis to be `"ok"` (storage/OAuth/jobs are reported but don't flip overall status — deliberate, so a dev env without R2 provisioned doesn't read as globally unhealthy).
- `/api/readiness` — narrower, database+redis only, meant for frequent load-balancer/deploy-pipeline polling.
- `/api/liveness` — zero external calls, detects a hung process only.

**This design extends these four files. It does not replace them or introduce a parallel `/health` under `lib/observability/`.** `lib/observability/health.ts` is a thin re-export/composition layer that adds the two dimensions the task requires but `lib/health/checks.ts` doesn't yet cover: **queue/worker depth** and **plugin health** — both of which need data this file doesn't have access to (Prisma's `JobRun` aggregation, plugin registry state) and both of which already have a data source elsewhere in the codebase.

## What's added

### `checkQueueHealth()` — new function in `lib/health/checks.ts`

Wraps the already-implemented `lib/jobs/metrics.ts`'s `getQueueHealth()` (queue depth, oldest-pending age, running count, dead-letter count — already computed for the `/admin/jobs` dashboard). No new aggregation logic; this just exposes the existing computation through the health-check interface:

```ts
export async function checkQueueHealth(): Promise<CheckResult & { depth: number; deadLetterCount: number }> {
  const { latencyMs, error } = await timed(async () => {
    const health = await jobMetrics.getQueueHealth();
    return health;
  });
  if (error) return { status: "error", message: toMessage(error), latencyMs, depth: 0, deadLetterCount: 0 };
  const health = await jobMetrics.getQueueHealth();
  // "degraded" (not "error") once depth crosses the alert threshold — see 07-alert-matrix.md
  const status: CheckStatus | "degraded" = health.deadLetterCount > 0 || health.depth > QUEUE_DEPTH_WARN ? "degraded" : "ok";
  return { status, latencyMs, depth: health.depth, deadLetterCount: health.deadLetterCount };
}
```

### `checkPlugins()` — new function in `lib/health/checks.ts`

Reads the plugin registry's last-recorded health (`services/plugins/plugin-service.ts`, already populated by the existing `pluginHealthCheck` Inngest cron job — no new health-probing logic, just surfacing what's already collected every 30 minutes):

```ts
export async function checkPlugins(): Promise<Record<string, CheckResult>> {
  const plugins = await pluginService.listWithHealth();
  return Object.fromEntries(
    plugins.map((p) => [p.id, { status: p.health.status === "healthy" ? "ok" : "error", message: p.health.message, latencyMs: p.health.latencyMs }]),
  );
}
```

### `checkWorkers()` — new, derived from `JobRun`

"Background worker" status for Inngest is fundamentally different from a traditional long-running worker process — Inngest workers are the Inngest platform's own infrastructure invoking `app/api/inngest/route.ts` on demand, not a process this app manages. "Worker health" here means: **is the app successfully executing jobs when Inngest invokes it** — derived from recent `JobRun` success rate (`lib/jobs/metrics.ts`'s `getJobTypeMetrics()`, already implemented) rather than a process-liveness check, since there is no separate worker process to probe.

## Endpoint changes

`/api/health` response gains two new keys in `checks`: `queue` and `plugins`, alongside the existing `database`, `redis`, `storage`, `oauth`, `backgroundJobs`. `backgroundJobs` itself is unchanged (still the credential-configured check) — queue depth is a distinct concern (are credentials valid vs. is the queue backing up) and stays a separate field so a caller can distinguish "Inngest isn't configured" from "Inngest is configured but jobs are piling up."

```json
{
  "status": "healthy",
  "version": "0.4.0",
  "environment": "production",
  "commit": "1ce731e...",
  "timestamp": "2026-08-05T14:00:00.000Z",
  "checks": {
    "database": { "status": "ok", "latencyMs": 4 },
    "redis": { "status": "ok", "latencyMs": 2 },
    "storage": { "status": "ok", "latencyMs": 31 },
    "oauth": { "betterAuthGoogle": "ok", "connectionHubGoogle": "ok", "connectionHubMicrosoft": "ok", "connectionHubYahoo": "unconfigured" },
    "backgroundJobs": { "status": "ok" },
    "queue": { "status": "ok", "latencyMs": 12, "depth": 3, "deadLetterCount": 0 },
    "plugins": { "gmail": { "status": "ok" }, "android-sms": { "status": "ok" }, "account-aggregator": { "status": "ok" }, "document-intelligence": { "status": "error", "message": "OCR provider timeout" } }
  }
}
```

`/api/readiness` and `/api/liveness` are **unchanged** — they're deliberately narrow-scope by design (readiness = "can this instance take traffic," liveness = "is the process alive at all"), and queue/plugin depth doesn't belong in a fast, frequently-polled check. Overloading readiness with slow checks would defeat its purpose.

## Overall-status semantics (unchanged principle, extended)

Only checks that gate "can this app safely serve real requests" flip the top-level `status` to `unhealthy`: database and Redis, exactly as today. Queue backlog and plugin failures are real, visible degradation but don't mean the app itself is down — they surface as `"degraded"` at the individual-check level while `status` stays `"healthy"` overall, consistent with the existing storage/OAuth/backgroundJobs treatment. This distinction matters for how a deploy pipeline or load balancer should react: `unhealthy` → stop routing traffic here; individual `"degraded"`/`"error"` checks with overall `"healthy"` → page/alert but keep serving.

## `lib/observability/health.ts` (new module)

Purely a composition/formatting layer for the admin dashboard and for any future alerting integration — imports from `lib/health/checks.ts` rather than re-implementing probes:

```ts
// lib/observability/health.ts
export { checkDatabase, checkRedis, checkStorage, checkOAuthProviders, checkBackgroundJobs, checkQueueHealth, checkPlugins } from "@/lib/health/checks";

export async function getFullHealthSnapshot() {
  // Same aggregation as /api/health's GET handler, reused by /admin/observability
  // so the dashboard and the health endpoint can never disagree.
}
```

`app/api/health/route.ts` itself is refactored to call `getFullHealthSnapshot()` rather than duplicating the aggregation inline, so there's exactly one place that decides what "healthy" means.

## Why not move health checks entirely into `lib/observability/`

`lib/health/checks.ts` is referenced by its own dedicated route handlers and is a small, already-correct, already-tested module. Moving it would be a pure rename with no functional benefit and would break the existing docs (`docs/security-hardening/01-remediation-plan.md` Priority 5, `docs/production-readiness/*`) that already reference its current location. `lib/observability/health.ts` exists to add the two new dimensions and to give the admin dashboard and any future external monitoring integration (e.g. an uptime-check webhook) one place to import from — not to relocate working code.
