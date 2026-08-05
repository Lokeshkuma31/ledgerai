# 02 — Telemetry Strategy

## Principle

Instrument at the **existing chokepoints**, not at every call site. This codebase already funnels almost everything through a small number of modules (`lib/api/error-handler.ts`, `lib/db/prisma.ts`, `lib/jobs/worker.ts`'s `defineJob()`, `lib/connections/engine.ts`). Observability should hook into those, matching the codebase's own "one entry point per subsystem" convention (documented in every `engine.ts` header comment) rather than editing every repository/route individually.

## Tool selection (already decided by `package.json`)

| Signal | Tool | Status today | Why this tool |
|---|---|---|---|
| Structured logs | Pino (`pino@^10.3.1`) | dependency, unused | Fast JSON logger, standard pairing with OTel trace-id injection, already chosen by a prior phase |
| Traces | OpenTelemetry (`@opentelemetry/sdk-node`, `@opentelemetry/api`, `@vercel/otel`) | **not installed** — net-new | Vendor-neutral; Vercel Functions run Node.js runtime so the full SDK works (no Edge subset limitation); `@vercel/otel` is Vercel's supported wrapper for Next.js `instrumentation.ts` |
| Errors | Sentry (`@sentry/nextjs@^10.69.0`) | dependency, unused | Already chosen; has first-class Next.js App Router + Server Action support |
| Product analytics | PostHog (`posthog-js` client, `posthog-node` server) | dependency, unused | Already chosen; single tool covers both client events and server-side capture |
| Health checks | Custom (`lib/health/checks.ts`) | **already implemented** | No reason to replace working, tested code |

No new packages are proposed beyond `@opentelemetry/sdk-node`, `@opentelemetry/api`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/instrumentation-http`, `@vercel/otel`, and Prisma's OTel instrumentation preview flag if used (`previewFeatures = ["tracing"]` is **not** required — a `$extends`-based manual span wrapper works without it and avoids a Prisma preview-feature dependency).

## Collection approach by system

| System | Existing entry point | What gets added |
|---|---|---|
| HTTP requests / Route Handlers | none (each route calls `handleApiError` on failure) | `tracing.ts` HTTP instrumentation (auto via `@vercel/otel`) + `context.ts` correlation-id middleware hook + access log line per request |
| Server Actions | `lib/api/error-handler.ts`'s `handleActionError` | Manual span wrap via a `withObservability()` helper (see [04](./04-tracing-strategy.md)) since Next.js doesn't auto-instrument Server Actions the way it does Route Handlers |
| Prisma queries | `lib/db/prisma.ts` (singleton, no `$use`/`$extends` today) | `$extends` client extension — one small addition to the singleton file, zero repository changes |
| Redis | `lib/cache/redis.ts` | Thin wrapping of the four existing `Ratelimit` instances' underlying client calls — span + duration metric per call |
| R2 / storage | `lib/storage/r2.ts` | Span around `S3Client.send()` |
| OAuth / Connection Hub | `lib/connections/engine.ts`, `oauth.ts`, existing `lib/audit/log.ts` calls | Span per OAuth step (authorize/callback/token-exchange/refresh); analytics event on connect/disconnect; audit log untouched |
| Inngest jobs | `lib/jobs/worker.ts`'s `defineJob()` | This is **the** integration point — instrument once here and every one of the 20 registered functions gets tracing/metrics for free. Populate the already-reserved `JobRun.traceId` field with the real OTel trace ID instead of a bare `crypto.randomUUID()` |
| Plugins | `lib/plugins/lifecycle.ts`, `lib/jobs/functions/plugins.ts` (`pluginHealthCheck`) | Wrap `Plugin.health()`/hook invocations with latency + success/failure counters |
| Sync engine (legacy) | `lib/sync/executor.ts` | Basic span coverage only — do not invest heavily; superseded by `lib/jobs/functions/sync.ts` per `docs/job-platform/README.md`. Instrument the Inngest-backed path as the primary target |
| Workflow engine | `lib/workflows/runner.ts` (legacy) + `lib/jobs/functions/workflows.ts` (`workflowExecute`, real) | Same split as sync — prioritize the Inngest path |
| External APIs (OAuth providers, future bank/document APIs) | `lib/connections/oauth.ts`, `plugins/*/plugin.ts` | Span per outbound `fetch()`, tagged with `provider` |

## Environment behavior

| Environment | Logging | Tracing | Errors | Analytics |
|---|---|---|---|---|
| `development` | Pino pretty-print to stdout, `debug` level | OTel console exporter (no external collector required) | Sentry disabled by default (`SENTRY_ENABLED=false`) unless explicitly opted in | PostHog disabled by default (no test events polluting production project) |
| `preview` (Vercel preview deployments) | Pino JSON, `info` level | OTLP exporter to collector, `environment` tag = `preview` | Sentry enabled, separate `environment` tag | PostHog enabled, `environment` tag = `preview`, filterable out of production funnels |
| `production` | Pino JSON, `info` level (`warn` for noisy subsystems if needed) | OTLP exporter, sampled (see below) | Sentry enabled, full capture | PostHog enabled |

Environment is read the same way `lib/health/checks.ts`/`app/api/health/route.ts` already does: `process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"`. Reuse that exact expression in `lib/observability/types.ts` so the `environment` field in every log/trace/error matches what `/api/health` already reports — no second source of truth for "what environment is this."

## Sampling

- **Traces**: 100% in development/preview; production defaults to head-based sampling at a configurable rate (`OTEL_TRACE_SAMPLE_RATE`, default `0.2`) for routine request spans, but **always 100% for**: any span that ends in an error/exception, any Inngest job span (volume is bounded — job count, not request count), any OAuth span (low volume, high diagnostic value), any Server Action mutation.
- **Logs**: never sampled — logs are cheap relative to traces and are the fallback when a trace wasn't sampled.
- **Analytics**: never sampled (PostHog volume here is user-action-bounded, not request-bounded).

## Performance guardrails

- All telemetry I/O (Sentry capture, PostHog capture, OTel export) must be **non-blocking** relative to the response — use `waitUntil` (Vercel Functions' background-work API, available in Fluid Compute) or the respective SDK's built-in async batching, never `await` a telemetry call before returning a response.
- The Prisma `$extends` query-timing wrapper must add negligible overhead: capture `Date.now()` before/after, no synchronous serialization of query args into the span (only query model/action name + duration, not bound parameters — see [08-privacy-review](./08-privacy-review.md)).

## What this phase does not do

- Does not replace `lib/health/checks.ts`, `lib/audit/log.ts`, or `lib/jobs/metrics.ts` — it extends them.
- Does not retrofit the legacy `lib/sync/engine.ts` / `lib/workflows/runner.ts` in-memory simulations beyond basic span coverage, consistent with `docs/job-platform/README.md`'s existing decision that they're superseded.
- Does not add a second audit-log table or a second "what happened to this OAuth connection" trail — `AuditLog` remains the one source of truth.
