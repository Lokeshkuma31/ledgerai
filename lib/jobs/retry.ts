/**
 * Retry policy — exponential backoff (delegated to Inngest's own
 * per-function `retries` count; see docs/job-platform/05-retry-strategy.md
 * §5.3 for why the curve itself isn't independently configurable),
 * transient/permanent error classification, and the shared `onFailure`
 * wiring every function in lib/jobs/functions/*.ts is built through via
 * worker.ts.
 */
import "server-only";
import { NonRetriableError } from "inngest";
import type { ErrorClassification } from "./types";
import * as jobService from "@/services/jobs/job-service";
import * as deadLetter from "./dead-letter";

export { NonRetriableError };

/** Max `retries` per job type — see docs/job-platform/05-retry-strategy.md
 * §5.4 for the rationale behind each number. Functions not listed fall
 * back to DEFAULT_RETRIES. */
export const RETRY_COUNTS: Record<string, number> = {
  "sync-run": 4,
  "document-parse": 3,
  "merchant-normalize": 3,
  classification: 3,
  "workflow-execute": 2,
  "feed-generate": 5,
  "search-index": 5,
  "semantic-index": 5,
  "notification-generate": 5,
  "notification-deliver": 3,
  "recurring-detect": 3,
  "forecast-refresh": 3,
  "budget-recalculate": 3,
  "analytics-refresh": 3,
  "recommendation-generate": 3,
  "summary-generate": 2,
  cleanup: 1,
  "connection-validate": 2,
  "plugin-health-check": 2,
};
export const DEFAULT_RETRIES = 3;

export function retriesFor(jobType: string): number {
  return RETRY_COUNTS[jobType] ?? DEFAULT_RETRIES;
}

/** Fail-closed error classification: docs/job-platform/05-retry-strategy.md
 * §5.2. Unrecognized error shapes are treated as permanent rather than
 * silently retried — an unknown failure surfaces in the dead-letter queue
 * immediately instead of burning a retry budget against a bug nobody has
 * reasoned about yet. */
export function classifyError(error: unknown): ErrorClassification {
  if (error instanceof NonRetriableError) return "permanent";

  const err = error as { name?: string; code?: string; message?: string; status?: number; statusCode?: number };
  const code = err?.code ?? "";
  const name = err?.name ?? "";
  const message = (err?.message ?? "").toLowerCase();
  const status = err?.status ?? err?.statusCode;

  // Validation errors (zod, malformed payloads) — retrying with identical
  // input reproduces the same failure.
  if (name === "ZodError" || name === "ValidationError") return "permanent";

  // Network / timeout — self-resolving.
  if (["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "EPIPE"].includes(code)) return "transient";
  if (name === "AbortError" || message.includes("fetch failed") || message.includes("network")) return "transient";

  // Provider / HTTP status classification.
  if (status === 429) return "transient"; // rate-limited — combined with queue.ts's throttle, should be rare
  if (status === 401 || status === 403) return "permanent"; // revoked/invalid auth — retrying won't fix it
  if (status === 404) return "permanent"; // e.g. an R2 object that genuinely doesn't exist
  if (typeof status === "number" && status >= 500) return "transient";

  // Database / cache blips (Neon pool exhaustion, Prisma connection
  // errors, Upstash timeouts) — Prisma engine error codes P1xxx are
  // connectivity-class, P2024 is a pool-timeout.
  if (code.startsWith("P1") || code === "P2024") return "transient";
  if (message.includes("redis") || message.includes("upstash")) return "transient";

  // Fail closed: anything unrecognized is permanent, not silently retried.
  return "permanent";
}

/** Extracts a human-readable message from anything classifyError() also
 * accepts — real Error instances, but also plain error-shaped objects
 * (e.g. a provider SDK's `{ status, message }` response), which
 * `instanceof Error` alone misses. */
function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const withMessage = error as { message?: unknown } | null;
  if (withMessage && typeof withMessage.message === "string") return withMessage.message;
  return String(error);
}

/** Throws the original error if classification is transient (Inngest
 * retries per the function's `retries` config); wraps it in
 * NonRetriableError otherwise, so Inngest stops immediately instead of
 * exhausting a retry budget against an unrecoverable failure. Call this
 * from a function's catch block before rethrowing. */
export function throwClassified(error: unknown): never {
  if (error instanceof NonRetriableError) throw error;
  const classification = classifyError(error);
  if (classification === "transient") throw error;
  throw new NonRetriableError(extractMessage(error), { cause: error });
}

/** Builds the `onFailure` handler passed to inngest.createFunction — fires
 * once, after retries are exhausted or a NonRetriableError was thrown,
 * with the *original* triggering event (Inngest wraps it under
 * event.data.event) and the terminal error. Routes to dead-letter.ts.
 * See docs/job-platform/05-retry-strategy.md §5.5. */
export function buildFailureHandler(jobType: string) {
  return async ({
    event,
    error,
  }: {
    event: { data: { event: { id?: string; name: string; data: Record<string, unknown> }; run_id: string } };
    error: Error;
  }) => {
    const original = event.data.event;
    const inngestEventId = original.id ?? "";
    const organizationId =
      typeof original.data?.organizationId === "string" ? (original.data.organizationId as string) : undefined;

    await jobService.markFailed({ jobType, inngestEventId }, serializeError(error), 0).catch(() => undefined);

    const run = await jobService.getRunByKey({ jobType, inngestEventId }).catch(() => undefined);
    if (!run) return;

    await deadLetter.routeToDeadLetter({
      jobRunId: run.id,
      jobType,
      organizationId,
      eventPayload: original,
      error: serializeError(error),
      originalRunId: event.data.run_id,
    });
  };
}

export function serializeError(error: unknown): { message: string; name?: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }
  return { message: extractMessage(error) };
}
