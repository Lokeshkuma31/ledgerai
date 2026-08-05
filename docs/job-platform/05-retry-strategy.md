# 5. Retry Strategy

## 5.1 Two retry mechanisms, not to be confused

- **Inngest's own retry**, controlled by each function's `retries: n` config — applies to the *whole function invocation* when it throws, and to individual `step.run()` calls independently (a failed step retries in place without re-running already-completed steps, via step memoization). Inngest manages the actual backoff curve internally; we do not hand-roll a sleep/setTimeout loop.
- **`lib/jobs/retry.ts`**, this platform's layer on top, which does three things Inngest doesn't do natively: (1) classifies an error as transient vs. permanent *before* deciding whether to let Inngest retry at all, (2) sets `retries` per function to a value chosen per job type (below), (3) wires each function's `onFailure` lifecycle handler to `dead-letter.ts` once retries are exhausted or a permanent error is thrown immediately.

## 5.2 Failure classification

`retry.ts` exports `classifyError(err: unknown): "transient" | "permanent"`, called at the top of every function's catch/step boundary:

| Category | Examples | Classification | Action |
|---|---|---|---|
| Network / timeout | `ECONNRESET`, `ETIMEDOUT`, fetch abort, Gmail/Graph 5xx | transient | rethrow as-is → Inngest retries |
| Provider rate-limited | Gmail/Graph 429, AI provider 429 | transient | rethrow (Inngest's backoff naturally spaces out retries; combined with §4.5 throttle, this should be rare) |
| Database connection blip | Neon pool exhaustion, transient PG connection error | transient | rethrow |
| Redis blip | Upstash timeout | transient | rethrow (only affects rate-limit/cooldown checks, not correctness — see [07](./07-idempotency-design.md) for why this is safe to retry) |
| Validation error | zod parse failure on event payload, malformed provider response | permanent | throw `NonRetriableError` (Inngest SDK's built-in class — stops retries immediately) |
| Authorization / auth failure | OAuth token revoked (`Connection.status = PERMISSION_REVOKED`), 401/403 from provider | permanent | throw `NonRetriableError` — retrying won't fix a revoked grant; instead the function dispatches `ledger/connection.disconnected` (or in the `sync-run` case, updates `Connection.status`) so a human/notification can react |
| Storage failure | R2 PUT/GET error | transient (R2 is generally available; treat as network-class) unless the object genuinely doesn't exist (404) | 404 → permanent, everything else → transient |
| Business-rule violation | e.g. classification confidence below threshold and no fallback category configured | permanent | `NonRetriableError` — retrying with identical input produces identical output |
| Unknown / unclassified error | anything not matching the above | **permanent (fail closed)** | Per-job default below — unrecognized errors do not get infinite/expensive retry budgets burned against them; they go to dead-letter for inspection, where a human can reclassify and manually retry once the root cause is understood |

The **fail-closed default for unknown errors** is a deliberate choice: silently retrying an error type nobody has reasoned about risks masking a real bug behind exponential backoff noise. Dead-lettering unknowns surfaces them immediately in the [/jobs dashboard](./08-worker-architecture.md), where a maintainer decides whether to add a new classification rule (transient) or fix the underlying bug (permanent, correctly).

## 5.3 Backoff curve

Inngest's built-in retry backoff (used whenever a function or step is allowed to retry) is exponential with jitter, roughly doubling the delay per attempt up to its internal cap, over the number of attempts set by `retries`. This platform does not override that curve — it only chooses `retries` per job type, since the curve itself isn't independently configurable per-attempt in the SDK. Where a job needs to wait *longer* than the automatic curve provides before a specific retry-adjacent action (e.g. waiting for an OAuth token refresh to propagate before re-checking connection health), that's expressed explicitly with `step.sleep()` inside the function body, not via the retry config.

## 5.4 Max retries per job type

| Job | `retries` | Rationale |
|---|---|---|
| `sync-run` | 4 | External API-heavy; transient provider errors are common and self-resolve; each retry is cheap relative to a full resync. |
| `document-parse` | 3 | OCR calls cost money per attempt — capped lower than sync. |
| `merchant-normalize`, `classification` | 3 | Mostly deterministic; a third failure after two automatic retries is more likely a real bug than a blip. |
| `workflow-execute` | 2 | Workflow steps can have side effects across multiple engines; excessive automatic retry risk of partial re-application is judged worse than surfacing the failure sooner (dead-letter after 2). |
| `feed-generate`, `search-index`, `semantic-index` | 5 | Cheap, purely idempotent upserts ([07](./07-idempotency-design.md)) — safe to retry aggressively. |
| `notification-generate` | 5 | Idempotent (cooldown-gated); missing a notification is worse than an extra retry. |
| `notification-deliver` | 3 | A delivery channel failure (e.g. email provider down) shouldn't be retried indefinitely if the channel is down for an extended period — dead-letter surfaces sustained outages faster. |
| `recurring-detect`, `forecast-refresh`, `budget-recalculate`, `analytics-refresh`, `recommendation-generate` | 3 | Cron-fired; next scheduled run is only a day away, so aggressive retry isn't as valuable as for user-facing paths. |
| `summary-generate` | 2 | Time-sensitive (a "morning briefing" retried into the afternoon has diminishing value) — dead-letter quickly and let the next day's cron supersede it. |
| `cleanup` | 1 | Idempotent by nature (deleting already-deleted rows is a no-op) but low-value to retry hard; next day's cron run will catch anything missed. |
| `connection-validate`, `plugin-health-check` | 2 | Health checks — a persistent failure is itself the signal worth surfacing quickly, not worth masking behind retries. |

## 5.5 Dead-letter routing

Every function in `registry.ts` is created with an `onFailure` handler (Inngest's per-function failure lifecycle hook, invoked once after all configured retries are exhausted, or immediately after a `NonRetriableError`) wired through a shared helper in `retry.ts`:

```ts
// lib/jobs/retry.ts — shape, not final code
export function withDeadLetterRouting(jobType: string) {
  return async ({ event, error, runId }: Inngest.FailureEventArgs) => {
    await deadLetter.routeToDeadLetter({ jobType, event, error, runId });
    await metrics.recordDeadLettered(jobType);
  };
}
```

`dead-letter.ts::routeToDeadLetter()` writes a `JobDeadLetter` row (new Prisma model — see [08](./08-worker-architecture.md) §8.2) capturing the full original event payload, the error message/stack, `jobType`, `organizationId`, and `originalRunId`, and updates the corresponding `JobRun.status = "DEAD_LETTER"`. This is a genuinely new persistence target — no existing model captures "this background operation failed permanently and needs a human," which is why it's called out as a required schema addition rather than reused from `SyncJob.errors`/`warnings` (those are per-run diagnostic logs, not a queryable, actionable failure inbox with manual-retry state).

## 5.6 Manual retry

`dead-letter.ts::retryDeadLetter(deadLetterId)`:

1. Loads the `JobDeadLetter` row.
2. Re-dispatches the original event through `dispatcher.dispatch()`, with a **new** Inngest event `id` (the original id already exists and would be deduped away — see [04](./04-queue-strategy.md) §4.6) but the same payload, plus `data.retryOf = deadLetterId` for traceability.
3. Marks the `JobDeadLetter` row `resolvedAt` / `resolvedBy` (the admin user, resolved via `getCurrentUserId()` in the `/jobs` API route — see [08](./08-worker-architecture.md) §8.6).
4. If the retried run also fails, a **new** `JobDeadLetter` row is created (not a re-open of the old one) — preserves a full audit trail of every attempt, consistent with the codebase's existing append-only pattern for `AuditLog`, `SyncHistoryEvent`, and `ConnectionHistoryEvent`.

This is exposed via the `/jobs` dashboard's job-detail view (§8.6) as a "Retry" button — no other manual-retry entry point is designed, to keep a single, auditable path for re-running failed work.
