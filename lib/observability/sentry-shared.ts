/**
 * Sentry config shared across all three runtimes (Node server, Edge
 * middleware, browser client) — deliberately has NO dependency on
 * context.ts (which uses node:async_hooks, unsupported in the Edge
 * runtime) so this file is safe to import from sentry.edge.config.ts and
 * sentry.client.config.ts as well as sentry.server.config.ts. See
 * docs/observability/08-privacy-review.md for the scrubbing rules.
 */
import type * as Sentry from "@sentry/nextjs";
import packageJson from "@/package.json";
import { resolveEnvironment } from "./types";

const FORBIDDEN_KEYS = new Set([
  "accesstoken",
  "refreshtoken",
  "token",
  "password",
  "authorization",
  "cookie",
  "description",
  "amount",
  "balance",
]);

export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = FORBIDDEN_KEYS.has(key.toLowerCase()) ? "[Redacted]" : scrub(val, depth + 1);
    }
    return out;
  }
  return value;
}

/** Shared `beforeSend` for every Sentry.init() call site. Strips cookies/
 * authorization headers outright and recursively scrubs the deny-list
 * from extra context and breadcrumbs — defense in depth on top of
 * `sendDefaultPii: false` and each capture call site's own discipline. */
export const sentryBeforeSend: NonNullable<Sentry.NodeOptions["beforeSend"]> = (event) => {
  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }
  }
  if (event.extra) event.extra = scrub(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = scrub(event.contexts) as typeof event.contexts;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({ ...b, data: b.data ? (scrub(b.data) as typeof b.data) : b.data }));
  }
  return event;
};

export const sentrySharedOptions = {
  environment: resolveEnvironment(),
  release: packageJson.version,
  sendDefaultPii: false,
  beforeSend: sentryBeforeSend,
} as const;

export function isSentryEnabled(): boolean {
  const explicit = process.env.SENTRY_ENABLED === "true";
  const defaultOn = process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
  return (explicit || defaultOn) && Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN);
}
