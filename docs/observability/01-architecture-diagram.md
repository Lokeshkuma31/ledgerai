# 01 — Observability Architecture Diagram

## Status quo (what this design builds on top of)

Five observability-adjacent packages are already `package.json` dependencies with **zero call sites**: `pino`, `@sentry/nextjs`, `posthog-js`, `posthog-node`. `@opentelemetry/*` is not installed at all. Three pieces of real observability infrastructure already exist and this design **extends them rather than replacing them**:

- `lib/health/checks.ts` + `app/api/health|readiness|liveness/route.ts` — live dependency probes (database, Redis, storage, OAuth config, background-job config).
- `lib/audit/log.ts` (`recordAuditEvent`) — the one and only audit trail, backed by the `AuditLog` Prisma model. Never throws; already redacts token material. See [08-privacy-review](./08-privacy-review.md).
- `lib/jobs/metrics.ts` — read-side `JobRun` aggregation for the `/admin/jobs` dashboard. Its own header comment: *"no observability provider is wired here — this only collects and exposes the fields those systems will eventually consume (duration, correlation id, trace id)."* `JobRun.traceId` is generated per run today and sits unused, reserved for exactly this phase.

This phase's job is to wire the five dormant packages into those seams — not to invent a parallel logging/audit/metrics system.

## System-level diagram

```mermaid
flowchart TB
    subgraph Client["Browser"]
        UI["React Server/Client Components"]
        PH_Client["posthog-js\n(lib/observability/analytics.ts)"]
    end

    subgraph Edge["middleware.ts"]
        MW["Rate limit + auth gate + security headers\n+ correlation ID mint/propagate (new)"]
    end

    subgraph Server["Next.js Server (Vercel Functions, Node runtime)"]
        RH["Route Handlers\napp/api/*"]
        SA["Server Actions\nlib/*/actions.ts"]
        EH["lib/api/error-handler.ts\nhandleApiError / handleActionError\n(single funnel point)"]

        subgraph Obs["lib/observability/*  (NEW)"]
            CTX["context.ts\nAsyncLocalStorage: correlationId,\nrequestId, userId, sessionId"]
            LOG["logger.ts\nPino JSON logger"]
            TRACE["tracing.ts\nOpenTelemetry SDK"]
            METRICS["metrics.ts\nlatency/error-rate counters"]
            ERR["errors.ts\nSentry capture"]
            AN["analytics.ts\nposthog-node"]
            HEALTH["health.ts\nwraps lib/health/checks.ts"]
        end

        subgraph Domain["Existing domain engines (unchanged business logic)"]
            PRISMA["lib/db/prisma.ts\n+ $extends query-timing (new)"]
            REDIS["lib/cache/redis.ts"]
            R2["lib/storage/r2.ts"]
            CONN["lib/connections/engine.ts\n+ health.ts + audit"]
            JOBS["lib/jobs/* (Inngest)\nworker.ts, dispatcher.ts, metrics.ts"]
            PLUG["lib/plugins/* + plugins/*"]
            SYNC["lib/sync/engine.ts (legacy)"]
            WF["lib/workflows/* (legacy + Inngest workflowExecute)"]
        end
    end

    subgraph External["External systems"]
        SENTRY["Sentry"]
        POSTHOG["PostHog"]
        OTELCOL["OTLP collector /\nVercel OTel"]
        LOGDRAIN["stdout → Vercel log drain"]
        INNGEST["Inngest Cloud"]
        PROVIDERS["Google / Microsoft / Yahoo OAuth"]
    end

    subgraph AdminUI["/admin/observability"]
        DASH["Dashboard: health, request rate,\nerrors, jobs, queues, providers,\nplugins, workers, slow requests"]
    end

    UI --> MW --> RH
    UI --> MW --> SA
    UI --> PH_Client --> POSTHOG

    RH --> CTX
    SA --> CTX
    CTX --> LOG --> LOGDRAIN
    CTX --> TRACE --> OTELCOL
    RH --> EH
    SA --> EH
    EH --> ERR --> SENTRY
    EH --> LOG

    PRISMA -. traced queries .-> TRACE
    REDIS -. traced calls .-> TRACE
    R2 -. traced calls .-> TRACE
    CONN -. OAuth spans + audit .-> TRACE
    CONN --> AUDIT["lib/audit/log.ts\n(existing, unchanged)"]
    CONN -.-> PROVIDERS

    JOBS -. job spans, JobRun.traceId .-> TRACE
    JOBS -. queue/job events .-> AN
    JOBS -.-> INNGEST
    PLUG -. plugin health/latency .-> METRICS
    SYNC -. sync events .-> AN
    WF -. workflow events .-> AN

    RH --> AN
    SA --> AN
    AN --> POSTHOG

    HEALTH --> PRISMA
    HEALTH --> REDIS
    HEALTH --> R2
    HEALTH --> CONN
    HEALTH --> JOBS
    HEALTH --> PLUG

    METRICS --> DASH
    HEALTH --> DASH
    JOBS --> DASH
    ERR -. recent exceptions via API .-> DASH
```

## Signal-to-store mapping

| Signal | Producer | Store / sink | Consumer |
|---|---|---|---|
| Structured logs | `logger.ts` (Pino) | stdout → Vercel log drain (configurable external drain, e.g. Axiom/Datadog, via env) | Log platform search, `/admin/observability` recent-errors panel (tails last N via API) |
| Traces/spans | `tracing.ts` (OpenTelemetry) | OTLP HTTP exporter → collector (Vercel-native OTel or external, env-driven) | Trace explorer, latency trend charts on admin dashboard |
| Metrics/counters | `metrics.ts` | In-process counters exported via OTel metrics API + read-side Postgres aggregation (`JobRun`, existing) | `/admin/observability`, alerting rules |
| Errors/exceptions | `errors.ts` (Sentry) | Sentry | Sentry UI, `/admin/observability` recent-exceptions panel (Sentry API) |
| Product analytics events | `analytics.ts` (PostHog) | PostHog | PostHog UI, funnels, retention |
| Health/readiness/liveness | `health.ts` (wraps `lib/health/checks.ts`) | Computed on request, no store | Load balancer/deploy pipeline, `/admin/observability` |
| Audit trail | `lib/audit/log.ts` (existing, unchanged) | `AuditLog` Postgres table | Security review, compliance, admin UI (existing pattern) |

## Why not a heavier stack

Vercel Functions (Fluid Compute, Node.js runtime — see `next.config`/deployment target) support the Node OpenTelemetry SDK natively; no Edge-runtime constraint applies here since none of `app/api/*` or `middleware.ts`'s rate-limit path use `runtime = "edge"`. This means the full `@opentelemetry/sdk-node` + Pino + Sentry + PostHog combination "just works" without a Edge-compatible-subset workaround. `@vercel/otel` is the recommended wrapper for the OTel SDK when deploying on Vercel — see [04-tracing-strategy](./04-tracing-strategy.md).

## Next documents

- [02 — Telemetry Strategy](./02-telemetry-strategy.md)
- [03 — Logging Specification](./03-logging-specification.md)
- [04 — Tracing Strategy](./04-tracing-strategy.md)
