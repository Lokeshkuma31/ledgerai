/**
 * Structured JSON logging (Pino) — see
 * docs/observability/03-logging-specification.md for the full field
 * table. Every call site gets a logger via `logger()`, which pulls the
 * active AsyncLocalStorage context (context.ts) so callers never have to
 * thread correlationId/userId/etc. through manually.
 *
 * `redact` is a defense-in-depth backstop, not the primary control — call
 * sites are expected to never pass forbidden fields in the first place
 * (see docs/observability/08-privacy-review.md). If one slips through,
 * Pino replaces it with "[Redacted]" rather than serializing it.
 */
import "server-only";
import pino from "pino";
import packageJson from "@/package.json";
import { getObservabilityContext } from "./context";
import { resolveEnvironment } from "./types";

/** Exported for testing (see __tests__/logger.test.ts) — the paths are
 * the actual contract this module ships, worth verifying directly rather
 * than only indirectly through the full pino-pretty-transport pipeline. */
export const REDACT_PATHS = [
  "accessToken",
  "refreshToken",
  "token",
  "password",
  "authorization",
  "cookie",
  "*.accessToken",
  "*.refreshToken",
  "*.token",
  "*.password",
  "*.authorization",
  "*.cookie",
  "description",
  "amount",
  "balance",
  "*.description",
  "*.amount",
  "*.balance",
];

const isProduction = process.env.NODE_ENV === "production";

// Deliberately always emits plain single-line JSON, in every environment
// — pino's `transport` option spawns a worker_thread that dynamically
// resolves its target module (e.g. "pino-pretty") via a filesystem path,
// which breaks under both Next.js's bundler and Vitest (confirmed: it
// throws "unable to determine transport target" in this repo's test
// suite, and the same worker-thread/bundling interaction is a known
// failure mode running Next.js in dev too). Plain JSON in dev is less
// pretty but has zero bundling risk; Vercel captures stdout automatically
// regardless of formatting (docs/observability/01-architecture-diagram.md's
// signal-to-store table).
const base = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: REDACT_PATHS, censor: "[Redacted]" },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

/** The one function every call site uses instead of `console.*`. Returns
 * a Pino child logger pre-populated with the active request/job context
 * plus environment/version — both computed fresh per call, never cached
 * at module scope, since environment/version are cheap and this avoids
 * any staleness question across warm Fluid Compute instances. */
export function logger() {
  const ctx = getObservabilityContext();
  return base.child({
    userId: ctx?.userId,
    sessionId: ctx?.sessionId,
    requestId: ctx?.requestId,
    correlationId: ctx?.correlationId,
    traceId: ctx?.traceId,
    spanId: ctx?.spanId,
    jobId: ctx?.jobId,
    pluginId: ctx?.pluginId,
    provider: ctx?.provider,
    route: ctx?.route,
    environment: resolveEnvironment(),
    version: packageJson.version,
  });
}
