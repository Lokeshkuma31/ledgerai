/**
 * Sentry integration — captures unhandled exceptions, Route Handler/
 * Server Action failures (via lib/api/error-handler.ts), background job
 * failures (via lib/jobs/worker.ts), OAuth/database/plugin/sync failures
 * wherever they're thrown. Scrubbing rules live in sentry-shared.ts
 * (shared with the Edge/client Sentry configs); this module adds the
 * Node-only context enrichment (user/job/request ids from
 * AsyncLocalStorage) on top. See docs/observability/08-privacy-review.md.
 */
import "server-only";
import * as Sentry from "@sentry/nextjs";
import { getObservabilityContext } from "./context";
import { scrub } from "./sentry-shared";

export interface CaptureContext {
  route?: string;
  jobId?: string;
  jobType?: string;
  provider?: string;
  pluginId?: string;
  errorCode?: string;
  extra?: Record<string, unknown>;
}

/** The one function every server-side call site uses instead of calling
 * Sentry.captureException directly — enriches with user/request/job/
 * provider context pulled from the active ObservabilityContext (never
 * more than a userId, never email/name — see 08-privacy-review.md) plus
 * whatever's passed explicitly. Returns the Sentry event id. */
export function captureException(error: unknown, context: CaptureContext = {}): string {
  const ctx = getObservabilityContext();
  return Sentry.captureException(error, (scope) => {
    scope.setTag("correlation_id", ctx?.correlationId ?? "unknown");
    if (ctx?.userId) scope.setUser({ id: ctx.userId });
    scope.setContext("request", { route: context.route ?? ctx?.route, requestId: ctx?.requestId });
    if (context.jobId || ctx?.jobId) {
      scope.setContext("job", { jobId: context.jobId ?? ctx?.jobId, jobType: context.jobType ?? ctx?.jobType });
    }
    if (context.provider ?? ctx?.provider) scope.setContext("provider", { provider: context.provider ?? ctx?.provider });
    if (context.pluginId ?? ctx?.pluginId) scope.setContext("plugin", { pluginId: context.pluginId ?? ctx?.pluginId });
    if (context.errorCode) scope.setTag("error_code", context.errorCode);
    if (context.extra) scope.setExtras(scrub(context.extra) as Record<string, unknown>);
    return scope;
  });
}
