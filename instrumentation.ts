/**
 * Next.js instrumentation hook — runs once per server instance, before any
 * other application code. This is the single place OpenTelemetry gets
 * initialized; nothing under lib/observability/tracing.ts creates its own
 * SDK instance. `@vercel/otel` wraps the Node OTel SDK with the context
 * propagation and HTTP/fetch auto-instrumentation Vercel's Fluid Compute
 * execution model expects, so Route Handler request spans exist without
 * any per-route code (see docs/observability/04-tracing-strategy.md).
 *
 * Sentry is initialized separately (lib/observability/errors.ts) rather
 * than through this same registerOTel() call — they're independent
 * systems by design (see docs/observability/02-telemetry-strategy.md).
 * Error capture itself stays funneled through lib/api/error-handler.ts,
 * the codebase's existing single choke point for Route Handler/Server
 * Action failures, rather than a second Next.js-level error hook.
 */
import { registerOTel } from "@vercel/otel";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { createTraceSampler } = await import("@/lib/observability/tracing");
    registerOTel({
      serviceName: "ledgerai",
      // "auto" lets @vercel/otel pick the right exporter for the
      // environment — an OTLP HTTP exporter when
      // OTEL_EXPORTER_OTLP_ENDPOINT is set, a sensible local default
      // otherwise. There's no "console" literal in @vercel/otel's
      // SpanExporterOrName type; passing a real ConsoleSpanExporter
      // instance would be the alternative if a forced-console mode is
      // ever needed for local debugging.
      traceExporter: "auto",
      traceSampler: createTraceSampler(),
    });
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/** Captures errors thrown during Server Component rendering / React
 * Server Component streaming — the one class of server-side error that
 * never passes through lib/api/error-handler.ts's handleApiError/
 * handleActionError (those only see Route Handler and Server Action
 * throws), so it needs its own Sentry hook. See
 * docs/observability/02-telemetry-strategy.md's "Principle" — this is the
 * one exception to "instrument at existing chokepoints," since no
 * existing chokepoint covers RSC render errors. */
export async function onRequestError(...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
