# 07 — Alert Matrix

## Delivery mechanism

Alerts route through whatever incident channel the team already uses (Slack/PagerDuty/email — not yet chosen in this codebase; treat as a deployment-time config, e.g. `ALERT_WEBHOOK_URL`). The application's responsibility is emitting the *signal* (metric threshold breach, health-check degradation) in a form an external alerting tool (Sentry alerts, a Vercel/Grafana/Datadog rule, or a simple scheduled Inngest function that polls `/api/health` and posts to a webhook) can act on — this design does not build a bespoke in-app alert-delivery system.

## Matrix

| # | Condition | Threshold | Severity | Source | Notes |
|---|---|---|---|---|---|
| 1 | Database unavailable | `checkDatabase()` returns `"error"` for 2 consecutive `/api/readiness` polls (~1 min at typical poll interval) | Critical | `/api/readiness` | Every request-serving path depends on this; page immediately |
| 2 | Redis unavailable | `checkRedis()` returns `"error"` for 2 consecutive polls | Critical | `/api/readiness` | Rate limiting fails open or closed depending on `lib/cache/redis.ts` behavior — confirm fail-open/closed semantics during implementation; either way this needs immediate attention |
| 3 | Storage (R2) failure | `checkStorage()` returns `"error"` (not `"unconfigured"`) for 3 consecutive polls | High | `/api/health` | Document upload/download degrades; not request-blocking for most of the app |
| 4 | OAuth failure spike | `connection.token_refresh_failed` audit events (`AuditLog`, existing) exceed 10 in 5 minutes for a single provider | High | `AuditLog` query / Sentry issue rate | Distinguish "provider is down" from "our token encryption/refresh logic broke" — check whether spike is single-provider (likely provider outage) or cross-provider (likely our bug) |
| 5 | Queue growth | `checkQueueHealth().depth` exceeds 500 pending jobs, or oldest-pending age exceeds 15 minutes | High | `lib/jobs/metrics.ts`'s `getQueueHealth()` via `/api/health` | Mirrors the stale-job reaper threshold already defined in `docs/job-platform/06-scheduling-strategy.md` §6.2 (10-minute floor × 3) |
| 6 | Worker/job failure rate | Job failure rate (from `getJobTypeMetrics()`) exceeds 20% for any job type over a 30-minute window | High | `lib/jobs/metrics.ts` | Per-job-type, not global — one broken job type (e.g. `documentParse` due to an OCR provider outage) shouldn't be masked by 19 healthy job types in an aggregate rate |
| 7 | Dead-letter accumulation | `JobDeadLetter` row count increases by more than 5 in 10 minutes | Critical | `checkQueueHealth().deadLetterCount` delta | Dead-letters mean retries are exhausted — needs human triage, already has a retry UI at `/admin/jobs` |
| 8 | High error rate (HTTP) | 5xx rate across `/api/*` exceeds 5% over a 5-minute window | Critical | Sentry issue rate / OTel metrics on `handleApiError` 500-class responses | |
| 9 | High error rate (Server Actions) | `handleActionError` 500-class rate exceeds 5% over 5 minutes for any single action | High | Sentry / `metrics.ts` action error counter | |
| 10 | Repeated sync failures | `sync_failed` analytics/Inngest events exceed 3 for the same `(userId, provider)` pair within 1 hour | Medium | PostHog event rate / `ledger/sync.failed` dispatch count | User-visible but not systemic unless it spans many users — see #11 for the systemic variant |
| 11 | Systemic sync failure | `sync_failed` rate exceeds 15% of all `sync_started` for a given provider over 1 hour, across users | Critical | Same source, aggregated by provider | Likely a provider-side or our-code-side outage affecting everyone, not one user's stale token |
| 12 | Plugin failure | `checkPlugins()` reports any plugin `"error"` for 2 consecutive `pluginHealthCheck` runs (60 minutes, since that job runs every 30 min) | Medium | `/api/health`'s `plugins` field, extended in [06](./06-health-monitoring-design.md) | |
| 13 | Background job platform down | `checkBackgroundJobs()` returns `"unconfigured"` or `"error"` in production environment specifically | Critical | `/api/health` | Only critical in `production` — expected/benign in local dev without Inngest credentials |
| 14 | Slow requests | p95 request latency exceeds 2s over 5 minutes for any route | Medium | OTel span duration metrics | Surfaced on `/admin/observability`'s latency trends panel, not necessarily paged |
| 15 | Slow database queries | Any single Prisma query span exceeds 1s | Low (log), Medium if sustained | Prisma `$extends` span duration ([04](./04-tracing-strategy.md)) | Individual slow query = log for later review; sustained (>5% of queries over 1s in a 10-min window) escalates to Medium |
| 16 | Authentication failure spike | Failed login attempts exceed `authRateLimit`'s threshold (10/60s) triggering for more than 20 distinct identifiers in 5 minutes | Medium | `lib/cache/redis.ts`'s `authRateLimit` rejection count | Possible credential-stuffing attempt, not necessarily an outage — security signal as much as an availability one |

## Severity → response expectation

| Severity | Response time | Channel |
|---|---|---|
| Critical | Immediate page | PagerDuty/on-call phone, plus Slack |
| High | Within 30 min during business hours, page off-hours if sustained >1hr | Slack + Sentry issue |
| Medium | Next business day triage | Slack digest / `/admin/observability` |
| Low | Weekly review | `/admin/observability` only, no push notification |

## Deliberately not alerted on

- `checkOAuthProviders()` `"unconfigured"` status in non-production environments — expected in dev/preview without full credential sets.
- Individual `document_parse_failed` events (Low/informational — the existing `document-intelligence` plugin's mock OCR provider, per `docs/production-readiness` findings, is a known interim state, not an incident).
- Single dead-letter entries (already surfaced and actionable via the existing `/admin/jobs` retry UI) — only the *rate* of new dead-letters (#7) is an alert condition.
