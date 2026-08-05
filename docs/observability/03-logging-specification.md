# 03 — Logging Specification

## Format

All logs are single-line JSON (Pino default), one object per log event, written to stdout. Vercel captures stdout automatically; an external log drain (Axiom, Datadog, etc.) is a deployment-time configuration, not an application-code concern.

## Required fields

Every log line emitted through `lib/observability/logger.ts` includes these fields when available in the current context. Fields that don't apply to a given log site (e.g. `jobId` outside a job execution) are omitted, never emitted as `null` — keeps log lines compact and avoids implying a field is always meaningful.

| Field | Type | Source | Notes |
|---|---|---|---|
| `timestamp` | ISO 8601 string | Pino `timestamp` hook | UTC |
| `level` | `"trace"\|"debug"\|"info"\|"warn"\|"error"\|"fatal"` | Pino level | Standard Pino levels |
| `msg` | string | call site | Human-readable, no interpolated PII (see [08](./08-privacy-review.md)) |
| `userId` | string (nullable) | `context.ts` AsyncLocalStorage, populated from `lib/auth/session.ts`'s `getCurrentSession()` | Absent for unauthenticated requests |
| `sessionId` | string (nullable) | Better Auth session id (not the raw cookie value) | |
| `requestId` | string | minted per HTTP request in `middleware.ts` / Route Handler entry, propagated via `x-request-id` | Unique per request, not reused on retry |
| `correlationId` | string | see [09-correlation-id-strategy](./09-correlation-id-strategy.md) | Shared across a request → job → sub-job chain |
| `traceId` | string (hex) | OTel active span context | Matches the trace visible in the tracing backend |
| `spanId` | string (hex) | OTel active span context | |
| `jobId` | string (nullable) | `JobRun.id` (existing Prisma model), set inside `lib/jobs/worker.ts`'s `defineJob()` wrapper | Only present for logs emitted during job execution |
| `pluginId` | string (nullable) | `Plugin.id` (e.g. `"gmail"`, `"android-sms"`) | Only present for plugin-originated logs |
| `provider` | string (nullable) | `"google"\|"microsoft"\|"yahoo"` (Connection Hub) or plugin-specific provider name | |
| `environment` | string | `process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"` | Same expression `lib/health/checks.ts` already uses |
| `version` | string | `package.json` `version` field, same as `/api/health`'s `version` field | |
| `route` | string (nullable) | Route Handler pathname or Server Action name | |
| `durationMs` | number (nullable) | Only on the completion log line for a request/action/query/job | |
| `errorCode` | string (nullable) | `ErrorCode` from `lib/api/errors.ts` when the log is error-related | Reuses the existing `AppError` code taxonomy, doesn't invent a new one |

## Base logger implementation shape

```ts
// lib/observability/logger.ts
import pino from "pino";
import { getObservabilityContext } from "./context";

const base = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
});

export function logger() {
  const ctx = getObservabilityContext();
  return base.child({
    userId: ctx?.userId,
    sessionId: ctx?.sessionId,
    requestId: ctx?.requestId,
    correlationId: ctx?.correlationId,
    traceId: ctx?.traceId,
    spanId: ctx?.spanId,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    version: packageJson.version,
  });
}
```

`context.ts` fields are injected via `pino.child()` per call rather than global mutable state, since Vercel Functions reuse warm instances across concurrent requests (Fluid Compute) — a module-level mutable "current request" object would leak between concurrent invocations. `AsyncLocalStorage` (Node's built-in, already implicitly safe under Fluid Compute's per-request execution context) is the correct primitive; see [09](./09-correlation-id-strategy.md).

## Log levels — usage convention

| Level | When |
|---|---|
| `fatal` | Process cannot continue (rare in a serverless function; mostly unused) |
| `error` | An operation failed and a human should look — mirrors today's `console.error("[api]", …)` / `console.error("[action]", …)` 5xx-only convention in `lib/api/error-handler.ts` |
| `warn` | Degraded but handled — e.g. a plugin contributor threw and was skipped (`lib/coach/contributors.ts`, `lib/feed/engine.ts`, `lib/plugins/hooks.ts` today log these via `console.error`; they should move to `warn`, since the current code deliberately treats these as non-fatal) |
| `info` | Normal lifecycle events — request completed, job completed, sync completed |
| `debug` | Verbose internals, dev-only by default |

## Migration of existing `console.*` call sites

Nine existing call sites move to the new logger, preserving their existing semantics exactly (no behavior change, just structured output):

- `lib/api/error-handler.ts` (2 sites) → `logger().error(...)`, still only for `statusCode >= 500`
- `lib/audit/log.ts` (1 site) → `logger().error(...)`, audit-write failure — the audit system itself gets observability without becoming dependent on it (still never throws)
- `lib/coach/contributors.ts` (3 sites), `lib/feed/engine.ts`, `lib/index/index.ts`, `lib/plugins/hooks.ts`, `lib/plugins/loader.ts` → `logger().warn(...)`, contributor/plugin failure pattern

No other files require changes to adopt base logging — new logging is additive at the Route Handler / Server Action / job-worker boundary, described in [04](./04-tracing-strategy.md).

## Example log lines

```json
{"timestamp":"2026-08-05T14:02:11.203Z","level":"info","msg":"request completed","requestId":"req_9f2a","correlationId":"corr_7c1e","traceId":"4bf92f3577b34da6a3ce929d0e0e4736","spanId":"00f067aa0ba902b7","userId":"usr_123","route":"POST /api/documents/upload","durationMs":184,"environment":"production","version":"0.4.0"}
{"timestamp":"2026-08-05T14:02:12.001Z","level":"error","msg":"job failed","jobId":"jr_8821","correlationId":"corr_7c1e","traceId":"4bf92f3577b34da6a3ce929d0e0e4736","route":"documentParse","errorCode":"INTERNAL_ERROR","durationMs":5012,"environment":"production","version":"0.4.0"}
{"timestamp":"2026-08-05T14:02:13.500Z","level":"warn","msg":"plugin contributor threw, skipped","pluginId":"gmail","provider":"google","correlationId":"corr_7c1e","environment":"production","version":"0.4.0"}
```

## What is never logged

See [08-privacy-review](./08-privacy-review.md) for the authoritative list — OAuth/refresh tokens, passwords, financial transaction descriptions, raw document/email bodies, and unnecessary PII are never included in `msg`, structured fields, or error stack traces passed to the logger.
