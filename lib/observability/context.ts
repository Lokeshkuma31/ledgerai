/**
 * Correlation ID + request context — AsyncLocalStorage-based, not module-
 * level mutable state. Vercel Fluid Compute reuses warm function instances
 * across *concurrent* invocations, so a plain `let current = ...` would
 * leak fields between simultaneously-executing requests on the same warm
 * instance; AsyncLocalStorage.run() scopes context correctly per logical
 * execution instead. See docs/observability/09-correlation-id-strategy.md.
 */
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { ObservabilityContext } from "./types";

const storage = new AsyncLocalStorage<ObservabilityContext>();

/** Read the active context, if any — returns undefined outside of any
 * runWithContext() call (e.g. during module initialization). Every
 * consumer (logger.ts, tracing.ts, analytics.ts) treats every field as
 * optional for exactly this reason. */
export function getObservabilityContext(): ObservabilityContext | undefined {
  return storage.getStore();
}

/** Runs `fn` with `context` as the active context for its entire
 * (possibly async) execution, merged over whatever context was already
 * active — so a job dispatched from within a request inherits that
 * request's correlationId/userId unless it explicitly overrides them. */
export function runWithContext<T>(context: Partial<ObservabilityContext>, fn: () => T): T {
  const parent = storage.getStore();
  const merged: ObservabilityContext = {
    correlationId: context.correlationId ?? parent?.correlationId ?? mintCorrelationId(),
    requestId: context.requestId ?? parent?.requestId,
    userId: context.userId ?? parent?.userId,
    sessionId: context.sessionId ?? parent?.sessionId,
    traceId: context.traceId ?? parent?.traceId,
    spanId: context.spanId ?? parent?.spanId,
    jobId: context.jobId ?? parent?.jobId,
    jobType: context.jobType ?? parent?.jobType,
    pluginId: context.pluginId ?? parent?.pluginId,
    provider: context.provider ?? parent?.provider,
    route: context.route ?? parent?.route,
  };
  return storage.run(merged, fn);
}

/** Same as runWithContext, but for handlers that return a Promise and
 * need the context active across the whole async chain (the common case
 * for Route Handlers/Server Actions/job functions). */
export async function runWithContextAsync<T>(context: Partial<ObservabilityContext>, fn: () => Promise<T>): Promise<T> {
  return runWithContext(context, fn);
}

export function mintCorrelationId(): string {
  return `corr_${crypto.randomUUID()}`;
}

export function mintRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

/** The single mint-or-inherit function every correlation ID producer
 * (middleware.ts, lib/jobs/dispatcher.ts, scheduled job entry points)
 * calls — see docs/observability/09-correlation-id-strategy.md's
 * "Generation rule" table. Prefers an explicitly-passed inbound id (e.g.
 * an `x-correlation-id` request header, or an Inngest event's
 * envelope.correlationId), then the active context, then mints fresh. */
export function getOrCreateCorrelationId(inbound?: string | null): string {
  if (inbound) return inbound;
  const active = storage.getStore()?.correlationId;
  if (active) return active;
  return mintCorrelationId();
}

/** Updates one or more fields on the currently active context in place —
 * used when a field becomes known partway through an execution (e.g. the
 * OTel span id, or the resolved userId after auth resolves). No-ops
 * outside an active context rather than throwing, consistent with this
 * module's "every field is optional" contract. */
export function updateObservabilityContext(patch: Partial<ObservabilityContext>): void {
  const current = storage.getStore();
  if (!current) return;
  Object.assign(current, patch);
}
