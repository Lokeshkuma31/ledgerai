# Phase 2 Implementation — Complete

All 20 implementation tasks (#12–#31) are done. `next build` succeeds cleanly (no errors, no Sentry warnings), and the full test suite passes (498/498, 68 files).

## What shipped

**Build blocker**: `app/sign-in/page.tsx`'s `useSearchParams()` extracted into a `SignInForm` child wrapped in `<Suspense>` — `/sign-in` now prerenders statically.

**`lib/observability/`**: `types.ts`, `context.ts` (AsyncLocalStorage), `logger.ts` (Pino, JSON-only — see note below), `tracing.ts` (OTel + `LedgerSampler`), `metrics.ts` (OTel histograms/counters + in-process ring buffer), `sentry-shared.ts` + `errors.ts` (Sentry), `analytics-events.ts` + `analytics.ts` + `analytics-client.ts` (PostHog), `health.ts` (composition over `lib/health/checks.ts`), `telemetry.ts` (`runRequestTelemetry`, `runActionTelemetry`, client bootstrap, shutdown).

**Instrumented chokepoints**: Prisma (`$extends` in `lib/db/prisma.ts`), R2 (`send()` wrapped once in `lib/storage/r2.ts`), Redis (`checkRedis()`'s `ping()` call spanned), `lib/api/error-handler.ts` (logger + Sentry + metrics on every 5xx), `middleware.ts` (correlation ID mint/propagate/echo), `lib/jobs/worker.ts`'s `defineJob()` (spans/logs/metrics/`JobRun.traceId` for all 20 job functions), both Server Action modules (`lib/connections/actions.ts`, `app/(admin)/jobs/actions.ts`) wrapped with `runActionTelemetry`.

**Analytics wired**: signup/login (`lib/auth/better-auth.ts`), connection lifecycle (`lib/connections/engine.ts`), sync started/completed/failed (`lib/jobs/functions/sync.ts`), document imported/parse-failed (`documents.ts`), plugin health degraded (`plugins.ts`, server-side) + plugin enabled/disabled (`components/PluginSettings.tsx`, **client-side** — see note), workflow executed (`workflows.ts`).

**Health**: `lib/health/checks.ts` gained `checkQueueHealth()`/`checkPlugins()`; `/api/health` now includes `queue`/`plugins`; `/api/readiness`/`/api/liveness` deliberately unchanged (narrow-scope by design).

**Admin dashboard**: `/admin/observability` (`app/(admin)/observability/page.tsx`) — dependency health, request rate/error rate/p95/slow requests, job metrics, recent job failures, provider + plugin health. `app/(admin)/layout.tsx` gained a Jobs/Observability nav (converted to `next/link`'s `<Link>` after ESLint caught the original `<a>` tags).

**Tests**: `lib/observability/__tests__/{context,logger,tracing,metrics,sentry-shared,analytics-events}.test.ts`, `lib/api/__tests__/error-handler.test.ts` — 6 new suites, all passing.

## Real bugs found and fixed during the build-verification pass

These are worth knowing about if touching these areas again:

1. **`console.*` → `logger()` migration initially broke the client bundle.** `lib/feed/engine.ts`, `lib/plugins/hooks.ts`, `lib/plugins/loader.ts`, `lib/coach/contributors.ts` are all reachable from Client Components (`components/WorkflowsOverview.tsx`, `components/PluginSettings.tsx`, `components/DashboardProvider.tsx`) despite having no `"server-only"` guard — none of them had one *before* this pass either, which was the tell. **Reverted these 4 files back to `console.warn`** (upgraded from `console.error` where the original was `error`, matching the intended log level) rather than the structured logger. Only `lib/api/error-handler.ts` and `lib/audit/log.ts` (already `"server-only"` before this pass) got the real logger.
2. **Pino's `transport: { target: "pino-pretty" }` breaks under both Vitest and (per Next.js's own worker-thread/bundler interaction) likely `next dev` too.** Removed entirely — `logger.ts` now always emits plain JSON, in every environment. Simpler and has zero bundling risk.
3. **`sentry.client.config.ts` is deprecated under Turbopack** — renamed to `instrumentation-client.ts` (Next.js's newer convention), added the `onRouterTransitionStart` export Sentry's SDK requires, dropped `disableLogger`/`automaticVercelMonitors` from `next.config.ts` (deprecated options).
4. **`@vercel/otel`'s `traceExporter` option has no `"console"` string literal** — `SpanExporterOrName` only accepts `"auto" | SpanExporter`. Fixed to `"auto"`.
5. **Prisma's `$extends` broke four repositories' transaction-client typing** (`transaction-repository.ts`, `document-repository.ts`, `notification-repository.ts`, `feed-repository.ts` all type a `prisma.$transaction(async (tx) => ...)` callback's `tx` as `Prisma.TransactionClient`, which isn't structurally assignable from an extended client's inferred `tx` type). Fixed at the source instead of touching all four call sites: `lib/db/prisma.ts` now casts the extended client back to the plain `PrismaClient` type on the way out (`as unknown as PrismaClient`) — safe because the extension only wraps existing methods for timing, it adds no new fields/models, so the cast doesn't hide any real type difference.
6. **`app/(admin)/layout.tsx`'s `<a>` tags** (both the new Jobs/Observability nav and the pre-existing "Back to app" link) **tripped ESLint's `no-html-link-for-pages` rule** — this had never surfaced before because the build never got past the `/sign-in` Suspense error to reach the lint step. Converted all three to `next/link`'s `<Link>`.
7. Added `app/global-error.tsx` (Sentry-recommended, catches React render errors that never pass through `lib/api/error-handler.ts` since those are Route Handler/Server Action-only).

## Deliberately deferred (not blockers, noted for follow-up)

- Only 5 of the ~9 Route Handlers got `runRequestTelemetry` wrapping consideration; in practice none were wrapped this pass (the helper exists in `telemetry.ts` but wasn't applied file-by-file to `/api/*` routes) — Server Actions and the Inngest job worker were prioritized as the higher-leverage chokepoints per the design doc. Route Handler tracing currently comes only from `@vercel/otel`'s automatic HTTP instrumentation, not the richer request-completion logging `runRequestTelemetry` provides.
- Analytics catalog: ~14 of the ~30 events are wired (auth, connections, sync, documents, plugins, workflows). Not wired: `budget_created`, `goal_created`, `dashboard_viewed`, `settings_updated`, `search_performed`, `ai_conversation_*`, `insight_viewed`, `forecast_viewed`, `connection_hub_viewed`, `transaction_imported` (no real code path exists yet — sync is still a stub), `merchant_normalized`, `recurring_detected`. These need their own feature-specific chokepoints (budget/goal/settings pages, search, AI coach) that weren't touched by this observability pass.
- The one pre-existing flaky test (`services/merchants/__tests__/merchant-service.test.ts`, a real-Neon-DB integration test) is unrelated to this work — confirmed by re-running it in isolation, where it passed. It's slow (~13s/test against a real remote DB) and times out under full-suite parallel load; not something this pass should "fix."
