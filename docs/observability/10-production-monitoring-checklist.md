# 10 — Production Monitoring Checklist

Pre-deployment validation for the observability platform described in documents 01–09. Organized so each section maps to one Phase 2 module.

## Build blocker (must be fixed before any of the below matters)

- [ ] `app/sign-in/page.tsx`'s `useSearchParams()` call is wrapped in a `<Suspense>` boundary (extract the search-params-consuming logic into a child component, wrap it in the page's default export) — confirmed the only `useSearchParams()` call site in `app/`, confirmed no existing `<Suspense>` ancestor.
- [ ] `next build` completes successfully with zero errors/warnings related to `useSearchParams`.

## `logger.ts` (Pino)

- [ ] All 9 existing `console.error`/`console.log` call sites migrated (`lib/api/error-handler.ts` ×2, `lib/audit/log.ts` ×1, `lib/coach/contributors.ts` ×3, `lib/feed/engine.ts`, `lib/index/index.ts`, `lib/plugins/hooks.ts`, `lib/plugins/loader.ts`) with equivalent-or-better semantics (see [03](./03-logging-specification.md)).
- [ ] Pino redaction config (`redact` option) covers the deny-list in [08-privacy-review](./08-privacy-review.md).
- [ ] `LOG_LEVEL` env var respected; defaults to `info` in production, `debug` in development.
- [ ] Log lines include all required fields from [03](./03-logging-specification.md) when available in context; no field is emitted as a literal `null`/`undefined` placeholder.
- [ ] Verified in a local `next build && next start` that log output is valid single-line JSON (not `pino-pretty` transport, which is dev-only).

## `tracing.ts` (OpenTelemetry)

- [ ] `instrumentation.ts` present at repo root, `register()` calls `@vercel/otel`'s `registerOTel()`.
- [ ] `@opentelemetry/*` + `@vercel/otel` added to `package.json` dependencies (net-new, per [02](./02-telemetry-strategy.md)).
- [ ] Prisma `$extends` query-timing wrapper added to `lib/db/prisma.ts`; confirmed no repository file under `repositories/*.ts` required changes.
- [ ] Redis, R2 call spans added without modifying `lib/cache/redis.ts`'s existing `Ratelimit` export signatures or `lib/storage/r2.ts`'s existing exports.
- [ ] `lib/jobs/worker.ts`'s `defineJob()` populates `JobRun.traceId` with the real OTel trace ID (replacing the placeholder `crypto.randomUUID()`).
- [ ] `withActionSpan()` applied to `lib/connections/actions.ts` and `app/(admin)/jobs/actions.ts`.
- [ ] Sampling config honors `OTEL_TRACE_SAMPLE_RATE`, with always-100% override for error/job/OAuth/Server-Action spans confirmed by test ([see tests checklist](#testing)).
- [ ] Span attributes never include values from the [08-privacy-review](./08-privacy-review.md) deny-list — verified by code review, not just by convention.

## `errors.ts` (Sentry)

- [ ] `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` (or the Next.js 15 App Router equivalent, e.g. `instrumentation.ts`-based Sentry init if `@sentry/nextjs`'s current major version recommends it) created.
- [ ] `sendDefaultPii: false` confirmed set.
- [ ] `beforeSend` scrubbing hook implemented per [08](./08-privacy-review.md).
- [ ] `handleApiError`/`handleActionError` in `lib/api/error-handler.ts` call `captureException` for 5xx-class errors, alongside (not instead of) the existing `logger().error(...)` call.
- [ ] Context enrichment confirmed present on captured exceptions: user context (userId only, no email/name), request context (route, method), job context (jobId, jobType) when applicable, provider context (provider name) when applicable, and release version (`package.json` version, matching `/api/health`'s `version` field).
- [ ] Sentry `environment` tag matches `process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"` exactly (same expression as `lib/health/checks.ts`).
- [ ] Source maps uploaded on production builds (standard `@sentry/nextjs` build-plugin behavior) so stack traces are readable.
- [ ] Manually triggered a test exception in a preview deployment and confirmed it appears in Sentry with correct `environment`/`release` tags and no forbidden fields in `extra`/breadcrumbs.

## `analytics.ts` (PostHog)

- [ ] `posthog-js` client init gated behind `NEXT_PUBLIC_POSTHOG_KEY` presence; no-ops cleanly if unset (so local dev without a PostHog project doesn't error).
- [ ] `posthog-node` server client uses `waitUntil`/async flush, never blocks a response.
- [ ] Every event in [05-analytics-event-catalog](./05-analytics-event-catalog.md) implemented at its documented trigger point; no event fires with undocumented properties (typed `capture()` wrapper, per [08](./08-privacy-review.md)).
- [ ] Manual QA: sign up, connect a provider, run a sync, upload a document, enable/disable a plugin — confirm each produces exactly the expected PostHog event with expected properties, and no financial values appear in any event payload (spot-check in PostHog's live event explorer).
- [ ] `identify()` called once per session with only the approved profile properties from [05](./05-analytics-event-catalog.md#identify-calls).

## `health.ts`

- [ ] `checkQueueHealth()` and `checkPlugins()` added to `lib/health/checks.ts`, `/api/health` response includes `queue` and `plugins` keys.
- [ ] `/api/readiness` and `/api/liveness` confirmed unchanged (narrow scope preserved, per [06](./06-health-monitoring-design.md)).
- [ ] `lib/observability/health.ts`'s `getFullHealthSnapshot()` used by both `/api/health`'s route handler and `/admin/observability`, confirmed they never disagree (single aggregation point).
- [ ] Verified `/api/health` still returns `200`/`healthy` when only database+redis are `"ok"`, even with storage/OAuth/queue/plugins degraded — overall-status semantics unchanged.

## `context.ts` (correlation IDs)

- [ ] `getOrCreateCorrelationId()` is the single mint point, used by `middleware.ts`, `lib/jobs/dispatcher.ts`, and scheduled-job entry points in `lib/jobs/functions/scheduled.ts`.
- [ ] `AsyncLocalStorage`-based (not module-level mutable state) — confirmed by a concurrency test (see [testing](#testing)).
- [ ] `x-correlation-id` response header present on Route Handler responses.
- [ ] Verified end-to-end: trigger a sync from the UI, confirm the same `correlationId` appears in (a) the Server Action's log line, (b) the dispatched Inngest event, (c) the job's log lines, (d) the job's audit log entry if one is emitted.

## Admin dashboard (`/admin/observability`)

- [ ] Gated by the same OWNER-role check as `/admin/jobs` (`app/(admin)/layout.tsx`) — reused, not reimplemented.
- [ ] Displays: system health (from `getFullHealthSnapshot()`), request rate, error rate, background jobs (reusing `/admin/jobs` data), queues, provider health (Connection Hub), plugin health, worker health, recent exceptions (Sentry API), slow requests, latency trends.
- [ ] No financial data rendered anywhere on this dashboard (it's an ops surface, not a user-facing one, but the [08-privacy-review](./08-privacy-review.md) rules still apply to what the *backing data* contains).

## Cross-cutting

- [ ] `next build` succeeds with zero errors (includes the `/sign-in` fix above).
- [ ] All five previously-dormant dependencies (`pino`, `@sentry/nextjs`, `posthog-js`, `posthog-node`) have at least one real call site; `@opentelemetry/*`/`@vercel/otel` added and initialized.
- [ ] `docs/production-readiness/01-production-architecture.md`'s target-state diagram (which already shows Sentry/OTel/PostHog/Pino as target boxes) is updated to reflect actual implementation, or superseded by a note pointing to `docs/observability/01-architecture-diagram.md`.
- [ ] `docs/production-readiness/05-launch-checklist.md`'s "Monitoring / Observability" section items are checked off where this phase completes them.
- [ ] Environment variables documented in `.env.example`: `LOG_LEVEL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_TRACE_SAMPLE_RATE`, `SENTRY_DSN`, `SENTRY_ENABLED`, `NEXT_PUBLIC_POSTHOG_KEY`, `POSTHOG_HOST`.

## Testing

- [ ] Unit tests for `context.ts`'s correlation ID propagation across simulated concurrent requests (verifies `AsyncLocalStorage` isolation, not leakage).
- [ ] Unit tests for Pino redaction (feed a forbidden field, assert it's redacted in output).
- [ ] Unit tests for the Prisma `$extends` wrapper (span created, duration recorded, no query args leaked into attributes).
- [ ] Integration test hitting `/api/health`, `/api/readiness`, `/api/liveness`, asserting response shape including the new `queue`/`plugins` fields.
- [ ] Integration test for at least one full request → Server Action → Inngest dispatch chain, asserting `correlationId` consistency (per the manual QA item above, automated).
- [ ] Test that a thrown error in a Route Handler produces both a `logger().error()` call and a `Sentry.captureException()` call (mock both, assert both invoked).
- [ ] Test that analytics events fire with exactly their documented property shape (schema validation against [05](./05-analytics-event-catalog.md), e.g. via a zod schema per event mirroring `lib/jobs/events.ts`'s pattern).
- [ ] Background job instrumentation test: run a job through `lib/jobs/worker.ts`'s `defineJob()`, assert `JobRun.traceId` is set to a real trace ID (not the old placeholder pattern) and that queue time, execution time, retry count are captured.

## Sign-off

Per the task's explicit instruction, Phase 2 implementation does not begin until documents 01–10 are reviewed and approved.
