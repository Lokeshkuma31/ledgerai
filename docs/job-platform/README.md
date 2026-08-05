# LedgerAI — Background Job Platform Design

**Prepared by:** Backend architecture review
**Date:** 2026-08-05
**Scope:** Design for migrating LedgerAI from synchronous, client-triggered "engine" calls to an Inngest-powered, event-driven background job platform.

## Methodology

This design is grounded in direct inspection of the codebase at the current `master` commit — the Prisma schema (47 models), the `services/*` + `repositories/*` persistence layer, the `lib/*/engine.ts` pure-calculation layer, and the existing (unwired) `inngest` dependency. Where the codebase already has a usable idempotency key, a schedule-timing calculation, or a lifecycle pattern, this design reuses it rather than inventing a parallel mechanism. Where a gap exists (no `JobRun` model, no admin auth pattern, Pino installed but unused), the gap is called out explicitly rather than assumed away.

**Ground truth at design time:**
- `inngest@^4.14.0` is installed but has zero call sites — no client, no functions, no `/api/inngest` route.
- `WorkflowRun.inngestEventId` (unique, nullable) is the only code artifact anticipating Inngest — unused today.
- The "expensive work" this platform must convert to jobs currently runs two ways: (a) not at all (document OCR post-upload, sync-kickoff post-connection — real gaps), or (b) synchronously inside `"use client"` components calling non-durable, in-memory/localStorage "engine" simulations (`lib/sync/engine.ts`, `lib/banks/sync-engine.ts`, `lib/workflows/runner.ts`'s in-flight `Set`). This platform replaces layer (b) and fills gap (a) — it does not touch the `services/*` + `repositories/*` Postgres layer, which is already production-shaped and becomes what jobs call into.
- Several models already carry the exact idempotency key a job needs (`FeedItem.[organizationId,key]`, `EmailRecord.[organizationId,providerId,externalId]`, `BriefingDeliveryLog.[organizationId,scheduleType,date]`, `ForecastSnapshot.[organizationId,generatedAt]`); others (`SyncJob`, `Transaction`, `Document`, `RecurringTransaction`) have none and need job-level dedup, documented per-model in [07](./07-idempotency-design.md).

## How to read this set

| # | Document | Answers |
|---|---|---|
| 1 | [Architecture Diagram](./01-architecture-diagram.md) | What are the pieces (Inngest, dispatcher, scheduler, queue config, workers, retry, dead-letter) and how does an event flow through them end to end? |
| 2 | [Event Catalog](./02-event-catalog.md) | What domain events exist, what's their payload schema, what triggers each, who consumes it? |
| 3 | [Job Dependency Graph](./03-job-dependency-graph.md) | Which jobs chain into which, via which events — including the example `EmailImported → ... → SearchIndex` chain? |
| 4 | [Queue Strategy](./04-queue-strategy.md) | How do priority, concurrency, FIFO-ish ordering, deduplication, and rate limiting work on top of Inngest's own execution model? |
| 5 | [Retry Strategy](./05-retry-strategy.md) | What's the backoff curve, max retries per job type, and the transient-vs-permanent classification rule? |
| 6 | [Scheduling Strategy](./06-scheduling-strategy.md) | What's cron-triggered, at what cadence, and how do new schedules get registered without editing the core scheduler? |
| 7 | [Idempotency Design](./07-idempotency-design.md) | For every job type, what guarantees repeated execution never duplicates a row? |
| 8 | [Worker Architecture](./08-worker-architecture.md) | What actually executes a job on Vercel, what's the lifecycle, and how does scaling/recovery work given Inngest (not us) owns the queue? |

## What this design explicitly does not do

- Does not replace or rewrite `services/*`, `repositories/*`, or any `lib/*/engine.ts` pure-calculation function — jobs call them, unchanged.
- Does not stand up Sentry or OpenTelemetry — `metrics.ts` (per [08](./08-worker-architecture.md)) collects the fields those systems will eventually consume (duration, correlation ID, trace ID placeholder), but no exporter is wired.
- Does not retrofit the legacy `lib/sync/engine.ts` / `lib/banks/sync-engine.ts` / `lib/workflows/runner.ts` in-memory simulations — those are superseded by this platform, not integrated with it. Client components that call them today (`ManualSyncButton.tsx`, `EmailDashboard.tsx`, etc.) are out of scope for the design docs and will be repointed to dispatch events during implementation.
- Does not add new financial features, redesign the UI, or change authorization/security hardening already in place.

## Status

Design only. Per the task brief, implementation (the `lib/jobs/*` modules, Prisma migration for job tracking, `/api/inngest` route, converted route handlers/server actions, `/jobs` dashboard, and tests) begins only after these eight documents are reviewed.
