/**
 * Unified telemetry initialization and lifecycle. Each signal already has
 * its own init path (OpenTelemetry in instrumentation.ts, Sentry in the
 * three sentry.*.config.ts files, PostHog client in analytics-client.ts)
 * — this module doesn't replace any of those. It covers the two things
 * that don't belong to any single signal module:
 *
 * 1. Client-side telemetry bootstrap (`initClientTelemetry`), called once
 *    from a root Client Component.
 * 2. The per-request lifecycle wrapper (`runRequestTelemetry`) that
 *    middleware.ts uses to mint/inherit a correlation id, run the rest of
 *    the request inside that context, and record the completed request's
 *    metrics + a completion log line — see
 *    docs/observability/09-correlation-id-strategy.md.
 */
import "server-only";
import { headers } from "next/headers";
import { logger } from "./logger";
import { runWithContextAsync, getOrCreateCorrelationId, mintRequestId } from "./context";
import { recordHttpRequest, recordActionResult } from "./metrics";
import { withActionSpan } from "./tracing";
import { shutdownAnalytics } from "./analytics";

export interface RequestTelemetryResult<T> {
  result: T;
  requestId: string;
  correlationId: string;
}

/** Wraps one HTTP request: mints/inherits requestId + correlationId, runs
 * `fn` inside that AsyncLocalStorage context, and — once `fn` resolves to
 * a Response — records the completed request's duration/status into
 * metrics.ts's ring buffer and emits a single "request completed" log
 * line carrying every required field from
 * docs/observability/03-logging-specification.md. */
export async function runRequestTelemetry(
  request: { method: string; url: string; headers: { get(name: string): string | null } },
  route: string,
  fn: () => Promise<Response>,
): Promise<RequestTelemetryResult<Response>> {
  const requestId = mintRequestId();
  const correlationId = getOrCreateCorrelationId(request.headers.get("x-correlation-id"));
  const start = Date.now();

  const result = await runWithContextAsync({ requestId, correlationId, route }, async () => {
    const response = await fn();
    const durationMs = Date.now() - start;
    recordHttpRequest({
      route,
      method: request.method,
      statusCode: response.status,
      durationMs,
      timestamp: Date.now(),
      correlationId,
    });
    logger().info({ durationMs, route, statusCode: response.status }, "request completed");
    return response;
  });

  return { result, requestId, correlationId };
}

/** The Server Action counterpart to runRequestTelemetry — reads the
 * x-correlation-id header middleware.ts already forwards (Server Actions
 * see the same incoming request headers a Route Handler would, via
 * next/headers), enters that correlation context, wraps the action body
 * in a `action.{name}` span (tracing.ts), and records success/failure +
 * duration into metrics.ts. Used by lib/connections/actions.ts and
 * app/(admin)/jobs/actions.ts — the only two Server Action modules in the
 * codebase. */
export async function runActionTelemetry<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const requestHeaders = await headers();
  const correlationId = getOrCreateCorrelationId(requestHeaders.get("x-correlation-id"));
  const start = Date.now();

  return runWithContextAsync({ correlationId, route: `action:${name}` }, () =>
    withActionSpan(name, async () => {
      try {
        const result = await fn();
        recordActionResult(name, Date.now() - start, true);
        return result;
      } catch (error) {
        recordActionResult(name, Date.now() - start, false);
        throw error;
      }
    }),
  );
}

/** Call once from a root Client Component (e.g. app/providers.tsx) to
 * bootstrap browser-side telemetry (PostHog). Dynamically imported so
 * this server-only module's static import graph never pulls posthog-js
 * into a server bundle. */
export async function initClientTelemetry(): Promise<void> {
  if (typeof window === "undefined") return;
  const { initAnalytics } = await import("./analytics-client");
  initAnalytics();
}

/** Flushes any buffered telemetry before a function instance is
 * suspended/recycled — currently just PostHog's server-side batching
 * (Sentry and OTel's own exporters manage their own flush timing). Wire
 * this into a Vercel `waitUntil` call at any long-running job boundary
 * (e.g. the end of lib/jobs/worker.ts's defineJob() wrapper) if buffered
 * events are observed being dropped in practice. */
export async function shutdownTelemetry(): Promise<void> {
  await shutdownAnalytics();
}
