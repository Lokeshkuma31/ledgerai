# 3. API Quota Strategy

## 3.1 What already exists to build on

Two independent throttling mechanisms already exist and this design composes with both rather than adding a third:

1. **Inngest function-level pacing** (`lib/jobs/queue.ts`'s `throttle()`/`hardRateLimit()`, per `docs/job-platform/04-queue-strategy.md` §4.5) — paces how often the `sync-run` *function itself* invokes, e.g. `{limit: 50, period: "1m", key: "event.data.providerId"}`. This bounds how many sync runs start per minute; it does not bound how many individual Gmail API calls happen *inside* one already-running sync-run step.
2. **Upstash `Ratelimit`** (`lib/cache/redis.ts`, five named limiters today, sliding-window, `prefix: "ratelimit:<name>"`) — the pattern `docs/job-platform/04-queue-strategy.md` §4.5 explicitly earmarks for a new `jobProviderRateLimit` limiter: paces individual outbound HTTP calls made in a loop inside one sync-run step, which Inngest's function-level throttle structurally cannot do.

This document defines the per-provider ceilings both mechanisms are configured against, plus a circuit breaker layer neither mechanism provides today.

## 3.2 Per-provider quota ceilings

| Provider | Quota model | Approximate ceiling (verify against current published limits before go-live) | Exhaustion signal |
|---|---|---|---|
| Gmail API | Project-wide daily quota + per-user per-second quota, in "quota units" (`messages.list`≈5, `messages.get`≈5, higher for `format=full`) | Per-user: 250 quota units/user/second (moving average); project default: 1B units/day (adjustable via Google Cloud Console request) | HTTP 403 with reason `quotaExceeded`/`rateLimitExceeded`/`userRateLimitExceeded` in the JSON error body, or HTTP 429 |
| Microsoft Graph (mail) | Per-app-per-mailbox throttling window | ~10,000 requests / 10 minutes / app / mailbox (Microsoft's published application-throttling guidance; subject to change) | HTTP 429 with a `Retry-After` header (Graph reliably sets this — use it verbatim rather than a fixed backoff, see §4) |
| Yahoo Mail API | Unknown — gated behind partner approval (§2.2.1 of `02-oauth-flow-review.md`) | **Not documented publicly; obtain from Yahoo partner agreement before implementation** | TBD — must be captured during partner onboarding, not assumed to match Gmail/Graph's shape |
| Account Aggregator (Sahamati Gateway) | Per-AA-agreement, not centrally published | **Provider/agreement-specific — obtain from the chosen AA's (Setu/Finvu/OneMoney) technical integration docs** | AA Gateway API returns a structured error envelope per the ReBIT spec; exact throttling error code TBD per AA |
| OCR provider | Depends on vendor selection (§5, `05-provider-capability-matrix.md`) — typically requests/second and/or pages/month | TBD pending vendor selection (§8 gates OCR rollout on this decision) | Vendor-specific HTTP 429 or a quota-specific error code |

**Explicit gap this table surfaces**: Yahoo, Account Aggregator, and OCR quota ceilings cannot be finalized from this codebase or public documentation alone — they require partner/vendor agreements not yet in place. Gmail and Microsoft Graph ceilings are well-published and can be configured now.

## 3.3 Detection

Quota exhaustion is detected at exactly one layer: the provider's own HTTP response, inspected inside `services/email/email-import-service.ts` (or the equivalent bank/AA service) before it reaches `lib/jobs/retry.ts::classifyError()`. This matters because `classifyError()`'s current generic HTTP-status mapping (`lib/jobs/retry.ts:70-73`) treats **any** 401/403 as `permanent` and any 429/5xx as `transient` — correct for auth errors, but **wrong for Gmail's `quotaExceeded`**, which Google returns as HTTP **403**, not 429. Left as-is, a real Gmail integration would have every quota-exceeded response misclassified as permanent (revoked auth) and routed straight to the dead-letter queue instead of being retried with backoff. This is the single most important correctness fix this document identifies:

> **Provider services must inspect the parsed error body (`reason: "quotaExceeded"` for Gmail; Graph's `error.code: "TooManyRequests"`; a `Retry-After` header's mere presence) and throw a distinguishable error shape *before* the generic classifier sees it** — either a dedicated `QuotaExceededError` (transient, carries a `retryAfterSeconds` hint) or by setting `status: 429` on the thrown error object regardless of the provider's literal HTTP status code, so `classifyError()`'s existing 429-is-transient rule applies correctly. This is a provider-service-layer responsibility (`services/email/email-import-service.ts`), never a change to the generic classifier itself, which must stay provider-agnostic per `01-provider-integration-architecture.md` §1.4.

## 3.4 User-facing reporting

Quota exhaustion surfaces through the same channels every other sync outcome already uses — no new UI surface:

- **Connection Hub status**: a new `quota-limited` value added to `ConnectionHealthStatus` (`lib/connections/types.ts:37-45`), sitting in the health-derivation precedence between `warning` and the hard-failure states (§7's Connection Hub UX table has the full precedence order). Surfaced in `DataSourceStatusStrip.tsx`/`ConnectionsSettingsCard.tsx` without new components, since both already render `ConnectionHealth.status` + `.message` generically.
- **Feed item**: mirrors `lib/sync/engine.ts`'s existing `buildSyncFeedItems()` pattern (`lib/sync/engine.ts:263-345`) — a "Sync Paused — Provider Quota Reached" item with the provider's own retry-after estimate in the summary, exactly like the existing "Provider Offline" item is generated after three consecutive failures (`lib/sync/engine.ts:330-341`).
- **AI Coach**: reuses the existing `SyncCoachSummary` contribution (`lib/sync/types.ts:205-214`) — the Coach narrates "your Gmail sync is paused due to a provider limit," it never explains quota mechanics or invents a retry time the system hasn't confirmed.

## 3.5 Recovery

Recovery is automatic, not user-initiated, for a true rate/quota condition:

1. The sync-run job throws the classified-transient error; Inngest retries per `RETRY_COUNTS["sync-run"] = 4` (`lib/jobs/retry.ts:22`) with its standard exponential backoff (§4 details the curve).
2. If a `Retry-After` header was present (Graph reliably provides one; Gmail does not), the provider service should prefer scheduling the next attempt at that delay over the generic backoff curve — this requires a small extension to how `sync-run` schedules its retry, since Inngest's built-in retry backoff is not directly parameterizable per-attempt from application code today (flagged as a build-time decision: either use Inngest's `step.sleep()` to implement a self-managed retry-after wait inside the function body for this one case, or accept the generic curve as "close enough" and skip the header — recommend the former only if early testing shows Graph's actual `Retry-After` values are meaningfully longer than the generic curve would wait).
3. Once retries are exhausted without recovery, the job dead-letters per the existing `buildFailureHandler`/`routeToDeadLetter` path (`lib/jobs/retry.ts:108-140`, `lib/jobs/dead-letter.ts`) — no provider-specific dead-letter handling; quota exhaustion that outlives 4 retries is treated the same as any other terminal sync failure and requires operator or scheduled re-run, not a bespoke recovery path.

## 3.6 Circuit breaker

Not present in the codebase today and net-new to this plan. Three-state breaker, evaluated per `(organizationId, providerId)` pair — the same key `mutex()` already scopes sync concurrency to (`lib/jobs/queue.ts:30-32`), so the breaker state can be co-located with that existing scoping rather than inventing a new dimension:

| State | Trigger | Behavior |
|---|---|---|
| Closed (normal) | Default | `sync-run` executes normally |
| Open | N consecutive quota-exceeded/5xx responses within a rolling window (recommended starting point: 3 consecutive `SyncJob` failures for the same `organizationId:providerId` within 15 minutes — read via a query against the existing `SyncJob` table, no new table required) | New `sync-run` invocations for that `(org, provider)` short-circuit immediately (`NonRetriableError`, so Inngest doesn't burn a retry budget) and connection health is set to `quota-limited` without attempting the call |
| Half-open | After a cooldown window (recommended: the longer of 15 minutes or the provider's own `Retry-After` hint, whichever was last observed) | Exactly one `sync-run` is allowed through; success closes the breaker, failure re-opens it and doubles the cooldown up to a cap |

This is implemented as a guard at the top of the `sync-run` job body (`lib/jobs/functions/sync.ts`'s existing `syncRun` function, alongside its current `check-in-flight` step at `:65-68`), reading recent `SyncJob` rows for that org+provider — not a new persistent state machine, consistent with `docs/job-platform/07-idempotency-design.md`'s preference for deriving state from existing tables over adding new ones where the existing table already carries enough history.

**The write path from "breaker opens" to "`ConnectionHealth.status = quota-limited`" is new composition, not an extension of `deriveHealth()`, and must be built as such.** `lib/connections/health.ts::deriveHealth()` is a pure function of a `StoredConnection`'s own `status`/`tokens` fields only — it has no parameter carrying `SyncJob` history and structurally cannot see the breaker's state (verified: `checkConnectionHealth()`, `health.ts`'s only other export, is called with just `(provider, record)`, no job history). Building this correctly requires a second, explicit write: when the circuit breaker opens inside `sync-run`, it must call a new function (recommended: `recordQuotaLimited(connectionId)` alongside `lib/connections/registry.ts`'s existing `recordHealth()`) that persists `quota-limited` onto `Connection.health` directly — **as an override layered on top of, not inside, `deriveHealth()`'s output**. Correspondingly, the hourly `connection-validate` cron (`lib/jobs/functions/connections.ts`) and any other caller of `checkAndRecordHealth()` must first check whether the breaker is still open for that connection (same `SyncJob`-history query) before trusting `deriveHealth()`'s token-only result — otherwise the very next hourly health check overwrites `quota-limited` back to `healthy` while the breaker is still open, since `deriveHealth()` has no idea a breaker exists. The breaker's own close transition (§3.6 table, "success closes the breaker") is what should clear the override, not the unrelated token-expiry check.

## 3.7 Observability

Every quota-related event is instrumented per `docs/observability/02-telemetry-strategy.md`'s existing per-system approach — extending `lib/observability/metrics.ts`'s meter (`meter.createCounter`/`createHistogram` under the existing `"ledgerai"` OTel meter) with:

- `provider.quota_exceeded` counter, tagged `{provider, organization_id, job_type: "sync-run"}` (organization_id is safe per the privacy review's "necessary PII" allow-list — it's an internal ID, not user PII).
- `provider.circuit_breaker.state_change` counter, tagged `{provider, from_state, to_state}`.
- `provider.rate_limit.remaining` gauge where a provider exposes it in response headers (Graph does via `RateLimit-Remaining`-style headers in some configurations; Gmail does not expose remaining quota headers).

No quota/rate-limit event ever contains a token, an email/transaction body, or a per-message identifier beyond what's already allowed under `docs/observability/08-privacy-review.md` — only counts, provider names, and organization/connection IDs.
