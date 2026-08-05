# 8. Worker Architecture

## 8.1 There is no worker process — and that's the point

On a traditional queue (Bull, SQS + a long-lived consumer, etc.), "worker" means a persistent process polling a queue. On Inngest + Vercel, a "worker" is **a single HTTP invocation of `app/api/inngest/route.ts`**, triggered by Inngest's own infrastructure per step of a function run. There is nothing to deploy separately, nothing to keep alive, and nothing that idles waiting for work — Vercel's (Fluid Compute) function scaling handles concurrency of invocations, and Inngest handles queuing/scheduling/retry orchestration ahead of each invocation. This is a correction of the two legacy in-memory job mechanisms already in the repo (`lib/sync/engine.ts`'s `pumpQueue`, `lib/workflows/runner.ts`'s in-flight `Set`), both of which implicitly assumed a single, always-running Node process — false on serverless, and the root cause of them being non-durable across redeploys.

```ts
// app/api/inngest/route.ts — shape, not final code
import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/engine";
import { functions } from "@/lib/jobs/registry";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
export const runtime = "nodejs"; // matches every other Route Handler in the app
```

## 8.2 Required schema additions

Two new Prisma models are required — nothing else in the 47-model schema is repurposed, since (per [07](./07-idempotency-design.md)) the existing models' idempotency keys are sufficient for *business* dedup, but none of them track *job execution lifecycle*, which is a distinct concern (a `SyncJob` row says "this sync ran," not "this Inngest invocation queued at T0, started at T1, retried twice, took 4.2s").

```prisma
enum JobStatus {
  QUEUED
  SCHEDULED
  RUNNING
  RETRYING
  COMPLETED
  FAILED
  CANCELLED
  DEAD_LETTER
}

model JobRun {
  id              String    @id @default(cuid())
  jobType         String    // matches the Inngest function id, e.g. "sync-run"
  eventName       String    // e.g. "ledger/sync.started"
  inngestEventId  String    @unique
  inngestRunId    String?   // Inngest's own run id, once known
  organizationId  String?   // nullable — cleanup/global jobs aren't org-scoped
  status          JobStatus @default(QUEUED)
  attempt         Int       @default(0)
  progress        Int?      // 0-100, null if not reported
  correlationId   String    // threads a full chain together, see 2.1
  traceId         String?   // placeholder for future OTel — collected, not yet exported
  input           Json?
  output          Json?
  error           Json?     // { message, stack, classification }
  queuedAt        DateTime  @default(now())
  startedAt       DateTime?
  completedAt     DateTime?
  durationMs      Int?
  relatedIds      String[]  // e.g. [transactionId, documentId] — for the dashboard's "related resources"

  @@index([organizationId, createdAt])
  @@index([jobType, status])
  @@index([status, startedAt]) // powers the stale-job reaper (6.2)
  @@index([correlationId])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model JobDeadLetter {
  id             String    @id @default(cuid())
  jobRunId       String    @unique
  jobType        String
  organizationId String?
  eventPayload   Json
  error          Json
  originalRunId  String
  resolvedAt     DateTime?
  resolvedBy     String?   // userId of the admin who retried/dismissed it
  retryOfId      String?   // set on the *new* JobDeadLetter row created if a manual retry also fails
  createdAt      DateTime  @default(now())

  @@index([organizationId, resolvedAt])
  @@index([jobType])
}
```

Both follow existing schema conventions exactly: `cuid()` ids, `organizationId` nullable-where-appropriate (matching `FinancialEvent`'s pattern for cross-org events), `Json` for variable-shaped payloads (matching `SyncJob.errors`/`WorkflowStepResult.output`), append-only for `JobDeadLetter` (matching `AuditLog`/`SyncHistoryEvent`). A `services/jobs/job-service.ts` + `repositories/job-repository.ts` pair should be added following the exact structure every other domain already uses (thin service, repository owns the Prisma import + `TO_DB`/`FROM_DB` enum maps).

## 8.3 Lifecycle & who writes each transition

| State | Written by | When |
|---|---|---|
| `QUEUED` | `dispatcher.ts`, at dispatch time, before `inngest.send()` returns | Immediately — the row exists even if Inngest hasn't invoked anything yet, so the dashboard can show "queued" jobs Inngest hasn't started |
| `SCHEDULED` | `scheduler.ts`-registered functions only, if the function itself calls `step.sleep()` before real work begins | Rare — most jobs go `QUEUED → RUNNING` directly; `SCHEDULED` is for jobs that intentionally delay (none in the initial catalog, reserved for future use e.g. "send this reminder in 3 days") |
| `RUNNING` | Shared `withJobTracking()` wrapper (below), at function entry | First line of every function body |
| `RETRYING` | Same wrapper, inside a caught-and-rethrown transient error path | Set just before rethrowing, so Inngest's own retry re-invocation is preceded by a visible state change |
| `COMPLETED` | Same wrapper, on successful return | Last line of every function body |
| `FAILED` | Same wrapper, in the function's own catch, only for the *final* attempt (checked via `event.attempt`/context) | Distinguishes "will retry" (`RETRYING`) from "retries exhausted, about to dead-letter" |
| `CANCELLED` | A cancellation handler (§8.5) | On `cancelOn` match or an admin-triggered cancel from `/jobs` |
| `DEAD_LETTER` | `dead-letter.ts::routeToDeadLetter()`, called from the `onFailure` hook | After `FAILED`, once `dead-letter.ts` has written the `JobDeadLetter` row |

Every function in `registry.ts` is created **through** a shared wrapper rather than each function hand-rolling these writes, so the bookkeeping can't drift function-to-function:

```ts
// lib/jobs/engine.ts — shape, not final code
export function createTrackedFunction(config, trigger, handler) {
  return inngest.createFunction(
    { ...config, onFailure: withDeadLetterRouting(config.id) },
    trigger,
    async (ctx) => {
      await jobService.markRunning(ctx.event.id, ctx.runId);
      try {
        const result = await handler(ctx);
        await jobService.markCompleted(ctx.event.id, result);
        return result;
      } catch (err) {
        const classification = classifyError(err);
        await jobService.markFailedOrRetrying(ctx.event.id, err, classification, ctx.attempt);
        throw err; // let Inngest's own retry mechanics decide what happens next
      }
    },
  );
}
```

`metrics.ts` (§8.7) hooks the same transitions rather than duplicating writes — `jobService.markRunning/markCompleted/markFailedOrRetrying` each call into `metrics.ts` internally.

## 8.4 Correlation ID and trace ID

`correlationId` is generated once, at the very first event in a chain (e.g. the cron tick or the user action that started everything), and copied verbatim into every downstream event's payload by `dispatcher.ts` whenever a function dispatches a follow-up event from within a run — `dispatcher.dispatch(event, data, { correlationId: ctx.event.data.correlationId })`. This is what lets `JobRun` rows for a nine-job fan-out chain (§3.2) all be queried together (`WHERE correlationId = ?`) in the dashboard's detail view, even though each is an independent Inngest function execution with its own `inngestEventId`.

`traceId` is collected (a `crypto.randomUUID()` generated per `JobRun` if not otherwise provided) but not yet exported anywhere — it exists so that when OpenTelemetry is wired in a future phase, `JobRun.traceId` already has a stable identity to map onto an OTel span, rather than needing a backfill.

## 8.5 Checkpointing, cancellation, and in-flight recovery

**Checkpointing** operates at two levels:
- **Automatic, step-level**: Inngest's own step memoization means if a Vercel function instance dies mid-run, the *next* invocation of that same run (Inngest re-invokes automatically) skips every `step.run()` that already completed and resumes from the first incomplete step — this covers the vast majority of "worker restart" recovery without any custom code.
- **Manual, coarse-grained**: for a single long-running step that itself processes many items (e.g. one `step.run("import-page", ...)` call paginating through 500 emails), `SyncJob.lastCheckpoint` (existing field) is read at the start of that step and written incrementally, so even a mid-step crash (which Inngest would otherwise just retry from scratch, re-fetching all 500) resumes from the last saved page cursor.

**Cancellation**: functions that should stop if their triggering resource disappears mid-run declare `cancelOn`, e.g. `sync-run` cancels if `ledger/connection.disconnected` fires for the same `connectionId` while the sync is in progress:

```ts
cancelOn: [{ event: "ledger/connection.disconnected", match: "data.connectionId" }]
```

The `/jobs` dashboard's manual "Cancel" action (job-detail view) dispatches this same event pattern rather than a separate cancel-specific mechanism — cancellation is just another event `cancelOn` already knows how to match, keeping one mechanism instead of two.

**In-flight recovery / worker restart**: the `schedule-stale-job-reaper` cron ([06](./06-scheduling-strategy.md) §6.2) is the backstop for the rare case where Inngest's own retry doesn't fire — e.g. a `JobRun` stuck `RUNNING` because the process died between `markRunning` and Inngest's own completion callback in a way that doesn't trigger `onFailure`. Per-job-type timeout thresholds (roughly 3x the job's typical duration, tracked by `metrics.ts`) determine when the reaper considers a `RUNNING` row stale enough to force into `FAILED` → dead-letter routing.

## 8.6 `/jobs` dashboard

New route group, `app/(admin)/jobs/`, gated by `getCurrentMembership().role === "OWNER"` (there's no existing admin-gating pattern to copy — per research, this is a new pattern, applied consistently to every route under `(admin)`). Pages:

- `app/(admin)/jobs/page.tsx` — summary: counts per `JobStatus` (via a single grouped `prisma.jobRun.groupBy`), average `durationMs`/success rate/failure rate per `jobType` over a rolling window, oldest `QUEUED` row's age (queue-depth proxy), recent activity feed (latest N `JobRun` rows across all types).
- `app/(admin)/jobs/[jobRunId]/page.tsx` — detail view: full `JobRun` row (id, `jobType`, `eventName` as trigger source, `status`, `progress`, `durationMs`, `attempt` as retry count), `input`/`output`/`error` Json rendered readably, `relatedIds` linked to their actual resources (transaction/document/etc. detail pages), and — if `status = DEAD_LETTER` — the linked `JobDeadLetter` row with a "Retry" button posting to `app/api/jobs/[jobRunId]/retry/route.ts`, which calls `dead-letter.ts::retryDeadLetter()`.
- `app/api/jobs/route.ts` (+ `[jobRunId]/route.ts`, `[jobRunId]/retry/route.ts`, `[jobRunId]/cancel/route.ts`) — thin Route Handlers over `services/jobs/job-service.ts`, following the exact auth-check-then-delegate shape every existing Route Handler already uses (`requireUserId()`/`getCurrentMembership()` at the top, matching `lib/auth/session.ts`'s chokepoint functions).

"Worker status" (from the task's requirements) is necessarily approximate on serverless — there's no fixed worker pool to enumerate. It's rendered as **recent invocation activity** (count of `RUNNING` `JobRun` rows right now, grouped by `jobType`, as a proxy for "how much is currently executing") rather than a literal worker list, with an explicit note in the UI that this reflects concurrent invocations, not persistent processes — avoids implying a worker-pool model that doesn't exist on this infrastructure.

## 8.7 Metrics collected (`lib/jobs/metrics.ts`)

Per the task's explicit "instrument, don't export" constraint (no Sentry/OTel providers yet), `metrics.ts` computes everything from `JobRun` rows already being written for lifecycle tracking — it does not introduce a second, parallel metrics store:

| Metric | Derivation |
|---|---|
| Avg execution duration per job type | `AVG(durationMs) WHERE jobType = ? AND status = 'COMPLETED'`, rolling window |
| Success / failure rate | `COUNT(status='COMPLETED') / COUNT(*)` per `jobType`, rolling window |
| Retry frequency | `AVG(attempt) WHERE status = 'COMPLETED'` — how many attempts completed runs typically needed |
| Queue depth | `COUNT(*) WHERE status IN ('QUEUED','SCHEDULED')` |
| Worker utilization (proxy) | `COUNT(*) WHERE status = 'RUNNING'`, grouped by `jobType`, against each job's configured concurrency limit ([04](./04-queue-strategy.md)) to express as a percentage |
| Execution latency (queue → running) | `AVG(startedAt - queuedAt)` per `jobType` |
| Age of oldest pending job | `MIN(queuedAt) WHERE status IN ('QUEUED','SCHEDULED')` |
| Execution time, queue time, retry count, errors, correlation id, trace id | Per-`JobRun` fields, directly — no aggregation needed, exposed as-is on the detail view |

`metrics.ts` exposes these as plain query functions (`getJobTypeMetrics(jobType, window)`, `getQueueDepth()`, etc.) consumed by the `/jobs` dashboard's server components — no separate metrics database or export pipeline, consistent with "do not implement observability providers yet."
