# 04 — Tracing Strategy

## SDK and initialization

OpenTelemetry Node SDK, initialized via Next.js's supported `instrumentation.ts` hook (root-level file, runs once per server instance before any other code). Use `@vercel/otel`'s `registerOTel()` as the entry point — it wires context propagation, the Node HTTP auto-instrumentation, and fetch instrumentation correctly for Vercel's Fluid Compute execution model, which a hand-rolled `NodeSDK` setup would otherwise have to replicate.

```ts
// instrumentation.ts (new, repo root)
import { registerOTel } from "@vercel/otel";

export function register() {
  registerOTel({
    serviceName: "ledgerai",
    traceExporter: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? undefined : "console",
  });
}
```

This is a **net-new dependency** (`@opentelemetry/*`, `@vercel/otel`) — the only one this design introduces; every other tool is already in `package.json`.

## Span taxonomy

| Layer | Span name pattern | Attributes |
|---|---|---|
| HTTP request | `HTTP {method} {route}` (auto, via `@vercel/otel`) | `http.method`, `http.route`, `http.status_code`, `correlation.id` |
| Server Action | `action.{name}` (manual, see below) | `action.name`, `user.id`, `correlation.id` |
| Prisma query | `prisma.{model}.{action}` (manual, via `$extends`) | `db.system=postgresql`, `db.model`, `db.action`, never raw query args |
| Redis call | `redis.{command}` | `redis.command` (e.g. `ping`, `limit`) |
| R2 / S3 call | `r2.{command}` | `r2.command` (e.g. `HeadBucket`, `PutObject`), `r2.bucket` |
| OAuth flow step | `oauth.{provider}.{step}` | `oauth.provider`, `oauth.step` (`authorize`\|`callback`\|`token_exchange`\|`refresh`), never token values |
| Inngest job | `job.{jobType}` | `job.id` (`JobRun.id`), `job.type`, `job.retry_count`, `job.status`, `correlation.id` — this span's trace ID **is** `JobRun.traceId` |
| Plugin call | `plugin.{pluginId}.{hook}` | `plugin.id`, `plugin.hook`, `plugin.version` |
| Sync run | `sync.{provider}.run` | `sync.provider`, `sync.job_id` |
| Workflow run | `workflow.{workflowId}.execute` | `workflow.id`, `workflow.trigger` |
| External API call | `external.{provider}.{operation}` | `external.provider`, `http.status_code` |

## Instrumentation by system

### HTTP requests / Route Handlers
Automatic via `@vercel/otel`'s HTTP instrumentation — no per-route code changes needed for the request span itself. Route Handlers add child spans only where they do meaningful sub-work not already covered by Prisma/Redis/R2 instrumentation.

### Server Actions
Next.js does not auto-instrument Server Actions. Wrap each with a helper:

```ts
// lib/observability/tracing.ts
export async function withActionSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(`action.${name}`, async (span) => {
    try {
      return await fn();
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

Applied at the two existing Server Action modules: `lib/connections/actions.ts` and `app/(admin)/jobs/actions.ts`. Any future Server Action module follows the same pattern — this is additive, not a rewrite of action logic.

### Prisma (`lib/db/prisma.ts`)
No `$use` middleware exists today (Prisma 7 removed it); the modern equivalent is a client extension via `$extends`, added once in the singleton:

```ts
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter }).$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        const span = tracer.startSpan(`prisma.${model ?? "raw"}.${operation}`);
        const start = Date.now();
        try {
          return await query(args);
        } catch (error) {
          span.recordException(error as Error);
          throw error;
        } finally {
          span.setAttribute("db.duration_ms", Date.now() - start);
          span.end();
          metrics.recordDbLatency(model ?? "raw", operation, Date.now() - start);
        }
      },
    },
  });
}
```

This satisfies "instrument every Prisma query through middleware so database activity is traceable without modifying repository logic" exactly — every one of the ~15+ `repositories/*.ts` files continues calling `prisma.model.method()` unchanged; the extension wraps at the client level.

**Caveat**: `$extends` changes the returned client's TypeScript type to an extended-client type. Because `globalThis.__prisma` and every repository import `prisma` as a single typed export from `lib/db/prisma.ts`, this is transparent to callers — but confirm during implementation that Prisma 7's extended-client type still satisfies existing repository code without additional casts.

### Redis (`lib/cache/redis.ts`)
The four `Ratelimit` instances wrap the same underlying `Redis` client. Rather than instrumenting `Ratelimit.limit()` internals (a third-party class), wrap the client Ratelimit is built from, and separately instrument any direct `redis.*` calls (e.g. `checkRedis()`'s `redis.ping()`) with a thin span helper.

### R2 (`lib/storage/r2.ts`)
Wrap `r2.send()` — the single method every call site (`HeadBucketCommand`, presigned URL generation in `lib/storage/signed-url.ts`, upload confirmation) goes through — with a span capturing the command name and duration.

### OAuth / Connection Hub
Spans added in `lib/connections/oauth.ts` (PKCE/state/token-exchange mechanics — the provider-agnostic layer) and `lib/connections/engine.ts` (the orchestration entry point). One span per OAuth step, correlated with the existing `lib/audit/log.ts` events emitted from the same code paths (`connection.created`, `connection.token_refreshed`, etc.) via the shared `correlationId` — see [09](./09-correlation-id-strategy.md). Token values never enter span attributes (enforced by [08-privacy-review](./08-privacy-review.md)).

### Inngest jobs
`lib/jobs/worker.ts`'s `defineJob()` is the single wrapper every one of the 20 registered functions passes through — instrument once here:

```ts
// inside defineJob()
return tracer.startActiveSpan(`job.${jobType}`, async (span) => {
  span.setAttributes({ "job.id": jobRun.id, "job.type": jobType, "job.retry_count": retryCount });
  const traceId = span.spanContext().traceId;
  await jobService.updateJobRun(jobRun.id, { traceId }); // populates the already-reserved JobRun.traceId field
  try {
    const result = await handler(event);
    span.setAttribute("job.status", "success");
    return result;
  } catch (error) {
    span.recordException(error as Error);
    span.setAttribute("job.status", "failed");
    throw error;
  } finally {
    span.end();
  }
});
```

This is the single highest-leverage integration point in the whole design: one change in `worker.ts`, all 20 job functions in `lib/jobs/functions/*` get tracing, and `JobRun.traceId` (currently `crypto.randomUUID()`, unused per `docs/job-platform/08-worker-architecture.md` §8.7) becomes a real, queryable OTel trace ID instead of an opaque UUID.

### Plugins
`lib/plugins/lifecycle.ts` (install/enable/disable/health-check) and `lib/jobs/functions/plugins.ts`'s `pluginHealthCheck` cron job wrap each `Plugin.health()` / hook invocation with a span + a latency metric keyed by `plugin.id`, feeding both tracing and the plugin observability requirements in [06](./06-health-monitoring-design.md).

### Sync engine / Workflow engine
Two implementations exist for each (legacy in-memory + real Inngest-backed) — see the codebase survey. Tracing investment follows the same priority as the rest of the platform: the Inngest-backed paths (`lib/jobs/functions/sync.ts`, `lib/jobs/functions/workflows.ts`) get full span coverage via the `defineJob()` wrapper above (already covered — no separate work needed). The legacy `lib/sync/executor.ts` / `lib/workflows/runner.ts` get a single top-level span each (`sync.legacy.run`, `workflow.legacy.run`) for visibility during the transition period, not deep instrumentation — consistent with `docs/job-platform/README.md`'s decision that they're superseded, not integrated with.

### External APIs
OAuth provider calls (`lib/connections/oauth.ts`) and any plugin-originated outbound `fetch()` (e.g. `plugins/gmail/plugin.ts` calling the Gmail API) get a span per call, tagged `external.provider`. Where Node's native `fetch` is used, `@vercel/otel`'s fetch instrumentation covers this automatically; no manual wrapping needed unless a plugin uses a non-fetch HTTP client.

## Context propagation

OTel's `AsyncLocalStorage`-based context (built into the Node SDK) automatically propagates the active span across `await` boundaries within one execution — this is what lets a Server Action's span be the parent of the Prisma spans it triggers, without manually threading a context object through every function call. Cross-boundary propagation (HTTP → Inngest job) is **not** automatic and is handled by the correlation ID strategy in [09](./09-correlation-id-strategy.md), since Inngest jobs execute in a separate invocation with no shared in-process context — the job's own span becomes a **new trace**, linked to the originating request's trace via `correlationId` (a link, not a parent-child span relationship, since Inngest's execution model doesn't support true distributed trace-context propagation without custom event-payload plumbing).

## Sampling

See [02-telemetry-strategy](./02-telemetry-strategy.md#sampling) — head-based sampling in production, always-100% for errors, jobs, OAuth, and Server Action mutations.
