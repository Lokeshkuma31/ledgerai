# Observability Platform — Design (Phase 1)

Design deliverables for a production-grade observability platform for LedgerAI: structured logging, distributed tracing, metrics, error reporting, product analytics, and health monitoring — covering every request, background job, synchronization, provider call, and user action.

**Scope**: observability only. No product features, no UI redesign. This phase (Phase 1) is design; implementation (`lib/observability/*`, Server Action/Route Handler instrumentation, the `/sign-in` build-blocker fix, the `/admin/observability` dashboard) does not begin until these ten documents are reviewed and approved, per the task's explicit instruction.

## Grounding

This design was produced after a full codebase survey (not from a blank slate). Key findings that shape every document below:

- Five observability packages are already `package.json` dependencies with **zero call sites**: `pino`, `@sentry/nextjs`, `posthog-js`, `posthog-node`. `@opentelemetry/*` is not installed at all — it's the one net-new dependency this design introduces.
- Real observability infrastructure **already exists** and is extended, not replaced: `lib/health/checks.ts` + `/api/health|readiness|liveness`, `lib/audit/log.ts` (the audit trail), and `lib/jobs/metrics.ts` (explicitly stubbed, per its own header comment, to await exactly this phase — `JobRun.traceId` is generated today and sits unused).
- The codebase has a strong "one entry point per subsystem" convention (`lib/*/engine.ts`, `lib/api/error-handler.ts`, `lib/jobs/worker.ts`'s `defineJob()`) — this design instruments those chokepoints rather than touching every route/repository individually.
- `docs/production-readiness/*` and `docs/job-platform/*` already contain considered decisions this design builds on rather than re-derives (e.g. "Sentry belongs in `handleApiError`/`handleActionError`," "audit trail = extend `AuditLog`, don't add a table").
- `app/sign-in/page.tsx` has a confirmed, unaddressed production build blocker (`useSearchParams()` with no `<Suspense>` boundary) — fixed as part of Phase 2, tracked in [10](./10-production-monitoring-checklist.md).

## Documents

1. [Architecture Diagram](./01-architecture-diagram.md) — system-level view of how logging, tracing, metrics, analytics, and health monitoring interconnect, and what already exists vs. what's new.
2. [Telemetry Strategy](./02-telemetry-strategy.md) — tool selection (already fixed by `package.json`), collection approach per system, sampling, environment behavior.
3. [Logging Specification](./03-logging-specification.md) — structured JSON schema, required fields, migration of the 9 existing `console.*` call sites.
4. [Tracing Strategy](./04-tracing-strategy.md) — OpenTelemetry instrumentation for HTTP, Server Actions, Prisma, Redis, R2, OAuth, Inngest jobs, plugins, sync/workflow engines, external APIs.
5. [Analytics Event Catalog](./05-analytics-event-catalog.md) — full event list, properties, client- vs. server-side capture.
6. [Health Monitoring Design](./06-health-monitoring-design.md) — extends the existing `lib/health/checks.ts` with queue and plugin health; does not replace it.
7. [Alert Matrix](./07-alert-matrix.md) — 16 alert rules with thresholds, severity, and response expectations.
8. [Privacy Review](./08-privacy-review.md) — the authoritative never-log list and enforcement mechanisms, referenced by every other document.
9. [Correlation ID Strategy](./09-correlation-id-strategy.md) — generation, propagation across HTTP/Server Actions/Inngest, relationship to `requestId`/`traceId`.
10. [Production Monitoring Checklist](./10-production-monitoring-checklist.md) — pre-deployment validation, organized per Phase 2 module.

## Phase 2 preview (not started)

`lib/observability/{logger,metrics,tracing,errors,analytics,health,telemetry,context,types}.ts`, Prisma `$extends` instrumentation, Server Action/Route Handler updates, the `/sign-in` Suspense fix, `/admin/observability`, and the test suite in [10](./10-production-monitoring-checklist.md#testing) — all scoped exactly as described in these ten documents, no additions invented at implementation time without updating the design first.
