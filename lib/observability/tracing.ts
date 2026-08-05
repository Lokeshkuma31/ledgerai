/**
 * OpenTelemetry tracing helpers — see
 * docs/observability/04-tracing-strategy.md for the full span taxonomy.
 * The SDK itself is initialized once in instrumentation.ts (via
 * @vercel/otel's registerOTel()); this module only provides the tracer
 * and the small set of span-wrapping helpers every instrumented system
 * (Prisma, Redis, R2, OAuth, Server Actions, Inngest jobs, plugins) uses.
 */
import "server-only";
import { SpanStatusCode, trace, type Attributes, type Span, type Tracer } from "@opentelemetry/api";
import {
  SamplingDecision,
  TraceIdRatioBasedSampler,
  type Sampler,
  type SamplingResult,
} from "@opentelemetry/sdk-trace-base";
import { getObservabilityContext, updateObservabilityContext } from "./context";

const TRACER_NAME = "ledgerai";

/** Always-sampled span-name prefixes — see
 * docs/observability/02-telemetry-strategy.md#sampling: errors, jobs,
 * OAuth, and Server Action mutations are always captured in full even
 * when head-based sampling is thinning out routine request spans. */
const ALWAYS_SAMPLE_PREFIXES = ["job.", "oauth.", "action."];

/** Custom sampler passed to @vercel/otel's registerOTel({ traceSampler })
 * in instrumentation.ts. Wraps a ratio-based sampler for routine spans,
 * but always samples the span kinds above regardless of the configured
 * ratio — the ratio only thins out generic HTTP/Prisma/Redis spans. */
export class LedgerSampler implements Sampler {
  private readonly ratioSampler: Sampler;

  constructor(ratio: number) {
    this.ratioSampler = new TraceIdRatioBasedSampler(ratio);
  }

  shouldSample(...args: Parameters<Sampler["shouldSample"]>): SamplingResult {
    const [, , spanName] = args;
    if (ALWAYS_SAMPLE_PREFIXES.some((prefix) => spanName.startsWith(prefix))) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }
    return this.ratioSampler.shouldSample(...args);
  }

  toString(): string {
    return `LedgerSampler(${this.ratioSampler.toString()})`;
  }
}

export function createTraceSampler(): Sampler {
  const ratio = Number(process.env.OTEL_TRACE_SAMPLE_RATE ?? "0.2");
  const isProduction = process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview";
  // 100% in development/preview (see 02-telemetry-strategy.md's
  // environment table); only production thins routine spans.
  return new LedgerSampler(isProduction ? ratio : 1);
}

export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

function baseAttributes(): Attributes {
  const ctx = getObservabilityContext();
  return ctx?.correlationId ? { "correlation.id": ctx.correlationId } : {};
}

/** Runs `fn` inside a new active span named `name`, recording exceptions
 * and setting an error status on throw, always ending the span. Also
 * syncs the resulting span's trace/span id back into the active
 * ObservabilityContext so logger.ts's log lines carry the same ids the
 * tracing backend shows — see docs/observability/09-correlation-id-strategy.md. */
export async function withSpan<T>(name: string, attributes: Attributes, fn: (span: Span) => Promise<T>): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, { attributes: { ...baseAttributes(), ...attributes } }, async (span) => {
    const spanContext = span.spanContext();
    updateObservabilityContext({ traceId: spanContext.traceId, spanId: spanContext.spanId });
    try {
      return await fn(span);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

/** Server Actions aren't auto-instrumented by Next.js the way Route
 * Handlers are (see 04-tracing-strategy.md) — every exported Server
 * Action wraps its body with this. */
export async function withActionSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return withSpan(`action.${name}`, { "action.name": name }, () => fn());
}

/** Wraps a single Inngest job execution — used exclusively by
 * lib/jobs/worker.ts's defineJob(), the one choke point every job
 * function passes through. Returns the span's trace id so the caller can
 * persist it onto JobRun.traceId (previously a bare crypto.randomUUID()
 * placeholder — see docs/job-platform/08-worker-architecture.md §8.7). */
export async function withJobSpan<T>(
  jobType: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<{ result: T; traceId: string }> {
  const tracer = getTracer();
  return tracer.startActiveSpan(`job.${jobType}`, { attributes: { ...baseAttributes(), "job.type": jobType, ...attributes } }, async (span) => {
    const spanContext = span.spanContext();
    updateObservabilityContext({ traceId: spanContext.traceId, spanId: spanContext.spanId, jobType });
    try {
      const result = await fn(span);
      span.setAttribute("job.status", "success");
      return { result, traceId: spanContext.traceId };
    } catch (error) {
      span.recordException(error as Error);
      span.setAttribute("job.status", "failed");
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

/** Thin, non-throwing wrapper for external calls (Redis, R2, OAuth
 * provider requests) where the caller wants a span + duration without
 * changing the function's error-propagation behavior — identical
 * semantics to withSpan, exported under a name that reads better at
 * those call sites. */
export const withExternalSpan = withSpan;
