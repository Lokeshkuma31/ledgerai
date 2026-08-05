/**
 * Shared types for lib/observability/*. Kept dependency-free (no server-
 * only imports) so this file can be imported from both server and client
 * observability modules — see docs/observability/03-logging-specification.md.
 */

export type Environment = "development" | "preview" | "production" | "unknown";

/** Same resolution order lib/health/checks.ts already uses for
 * `/api/health`'s `environment` field — reused here verbatim so every
 * signal (logs, traces, errors, health) agrees on what environment this
 * is running in. */
export function resolveEnvironment(): Environment {
  const raw = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
  if (raw === "development" || raw === "preview" || raw === "production") return raw;
  return "unknown";
}

/** The fields threaded through every log line, span attribute set, and
 * error report via AsyncLocalStorage — see
 * docs/observability/09-correlation-id-strategy.md. Every field is
 * optional because most of them only exist once a request/job/plugin
 * context has actually been entered. */
export interface ObservabilityContext {
  correlationId: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  traceId?: string;
  spanId?: string;
  jobId?: string;
  jobType?: string;
  pluginId?: string;
  provider?: string;
  route?: string;
}

/** lib/api/errors.ts's ErrorCode, re-declared here to avoid this
 * dependency-free module importing a file that isn't itself dependency-
 * free — kept in sync manually since ErrorCode changes rarely. */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT";

export interface RequiredLogFields {
  timestamp: string;
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  msg: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  jobId?: string;
  pluginId?: string;
  provider?: string;
  environment: Environment;
  version: string;
  route?: string;
  durationMs?: number;
  errorCode?: ErrorCode;
}
