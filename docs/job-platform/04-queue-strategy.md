# 4. Queue Strategy

## 4.1 There is no queue to build — only configuration

Inngest *is* the durable queue, scheduler, and executor. `lib/jobs/queue.ts` does not implement a queue; it is a small library of **config builders** that every function in `registry.ts` composes into its `createFunction(...)` options, so priority/concurrency/dedup/rate-limit rules are declared consistently instead of copy-pasted per function. This corrects the two legacy in-memory queues already in the repo (`lib/sync/engine.ts`'s `pumpQueue`, `lib/workflows/runner.ts`'s in-flight `Set`) which cannot survive a redeploy or coordinate across serverless instances — see [01](./01-architecture-diagram.md) §1.4.

```ts
// lib/jobs/queue.ts — shape, not final code
export function orgConcurrency(limit: number) {
  return { limit, key: "event.data.organizationId" };
}
export function globalConcurrency(limit: number) {
  return { limit }; // unscoped — caps total in-flight runs of this function across all orgs
}
export function providerMutex(key: string) {
  return { limit: 1, key }; // serializes runs sharing this key, e.g. one sync per provider per org at a time
}
```

## 4.2 Concurrency limits per job type

Every function declares an array of `concurrency` constraints (Inngest evaluates all of them — the most restrictive wins). Two dimensions matter here: **per-org fairness** (one noisy org can't starve everyone else) and **protecting a shared downstream resource** (Neon's Postgres connection pool via `@neondatabase/serverless`, Gmail/Graph per-account rate limits, Upstash Redis request budget).

| Job | Per-org limit | Global limit | Rationale |
|---|---|---|---|
| `sync-run` | 1 (mutex, key = `organizationId:providerId`) | 25 | Provider mutex prevents two overlapping syncs corrupting `SyncJob.lastCheckpoint` for the same connection; global cap respects aggregate Gmail/Graph API quota across all tenants. |
| `document-parse` | 3 | 15 | OCR calls are the slow step; capped globally to bound cost from a paid OCR provider. |
| `merchant-normalize` | 5 | 40 | Cheap, mostly DB reads — high concurrency is safe. |
| `classification` | 5 | 30 | Bounded by AI provider rate limits (`lib/ai/provider.ts`), not DB. |
| `workflow-execute` | 3 | 20 | Workflow steps can have side effects (writes across several engines) — kept conservative until workflow authors mark individual workflows safe for higher concurrency. |
| `feed-generate` | 5 | 40 | Idempotent upsert-by-key ([07](./07-idempotency-design.md)) — safe to run hot. |
| `notification-generate` / `notification-deliver` | 5 | 30 | Gated further by `NotificationCooldown` and `NotificationPreferences.maxNotificationsPerDay`, so queue concurrency isn't the primary throttle here — cooldown state is. |
| `recurring-detect`, `forecast-refresh`, `budget-recalculate`, `analytics-refresh`, `recommendation-generate` | 1 (per org, since they read the org's full transaction history) | 10 | Cron-fired, fanned out across all orgs — global cap prevents a thundering herd against Postgres at the top of every scheduled hour. |
| `search-index` / `semantic-index` | 5 | 25 | Cheap per-item; `semantic-index` additionally rate-limited by AI provider (below). |
| `cleanup` | n/a (not org-scoped) | 1 | Bulk deletes — serialize to avoid lock contention on shared tables (`Session`, `AuditLog`). |
| `connection-validate`, `plugin-health-check` | 3 | 15 | Health checks — cheap, but capped to avoid hammering OAuth providers' token-introspection endpoints. |

## 4.3 Priority

Inngest supports a `priority.run` expression evaluated per-run to reorder within its queue. Two priority tiers are used:

- **High priority** (`event.data.priority === "interactive"`): jobs directly triggered by a waiting user action — e.g. "sync now" click, document upload confirm. These set `data.priority = "interactive"` at dispatch time in the calling route/action.
- **Normal priority** (default, unset): everything cron-originated or chained from another job's completion event.

```ts
priority: { run: "event.data.priority == 'interactive' ? 60 : 0" }
```

This is applied only to the *first* function in a chain that a user can be waiting on (`sync-run`, `document-parse`). Downstream fan-out functions (`feed-generate`, `search-index`, etc.) stay at default priority since no one is watching a spinner for them.

## 4.4 FIFO / ordering

Inngest does not guarantee strict global FIFO, and this design does not need it — the one place ordering actually matters is **within a single provider connection's sync**, which is already handled by the per-provider mutex (§4.2) rather than a FIFO queue: only one `sync-run` for a given `organizationId:providerId` executes at a time, and `SyncJob.lastCheckpoint` gives it a resumable cursor (see [08](./08-worker-architecture.md) §8.4), so ordering within that stream is enforced by mutual exclusion + checkpoint, not by queue position. Everywhere else in the graph, jobs are designed to be commutative (a `feed-generate` triggered by `budget.updated` doesn't need to happen before or after one triggered by `forecast.updated` — both are independent upserts), so FIFO ordering would add complexity without a correctness benefit.

## 4.5 Rate limiting (outbound provider calls)

Two Inngest primitives, chosen per job based on whether excess events should be **dropped** or **queued**:

- **`rateLimit`** (hard cap, drops events beyond the limit within the period): used where a repeat trigger within the window is genuinely redundant, e.g. `connection-validate` — `{ limit: 1, period: "1h", key: "event.data.connectionId" }` matches the existing `connection.validation.requested` hourly-bucket dedup key from [02](./02-event-catalog.md).
- **`throttle`** (soft cap, queues excess up to a limit rather than dropping): used for genuinely valuable work that must still eventually run, just paced to respect a provider's rate limit, e.g. `sync-run`'s Gmail API calls — `{ limit: 50, period: "1m", key: "event.data.providerId" }`.

This composes with the existing Upstash `Ratelimit` pattern in `lib/cache/redis.ts` (five named limiters, `Ratelimit.slidingWindow`, `prefix: "ratelimit:<name>"`) rather than replacing it: Inngest's `throttle`/`rateLimit` governs *function invocation* pacing; a new `jobProviderRateLimit` Upstash limiter (same construction pattern, new prefix) governs *individual outbound HTTP calls within* a function body where a single sync run makes many provider requests in a loop — Inngest's function-level throttle alone can't pace calls inside one already-running step.

## 4.6 Deduplication

Two layers, matching the "prevent duplicate events from spawning duplicate jobs" requirement:

1. **Event-level dedup** — every `dispatcher.dispatch()` call passes an explicit Inngest event `id` (not left auto-generated) built from the deterministic keys in the [Event Catalog](./02-event-catalog.md)'s rightmost column. Inngest deduplicates events sharing an `id` sent within a rolling window, so re-dispatching the same logical event (e.g. a retried route handler, a replayed webhook) is a no-op at the broker before any function even runs.
2. **Function-level `idempotency`** — functions additionally declare `idempotency: "event.data.transactionId"` (or the equivalent per-job key) so that even if two *distinct* events happen to reference the same underlying resource (e.g. two different triggers both wanting to reclassify the same transaction), only one execution proceeds.

Both layers are broker-side guarantees; [07](./07-idempotency-design.md) covers the *database-level* backstop (unique constraints / upserts) required because neither layer protects against a manual `dead-letter.ts::retryDeadLetter()` replay or an operator resending an event with a fresh id — that must be safe by construction at the write layer, not just at the broker.

## 4.7 Checkpointing, cancellation, progress — pointers

Covered in depth in [08](./08-worker-architecture.md) since they're properties of individual function execution rather than queue configuration: checkpointing via `SyncJob.lastCheckpoint` + Inngest's native step memoization (§8.4), cancellation via `cancelOn` matched against `ledger/connection.disconnected` for in-flight syncs (§8.5), progress via periodic `JobRun.progress` writes from long-running steps (§8.3).
