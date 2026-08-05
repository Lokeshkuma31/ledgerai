/**
 * PostHog product analytics — server side (posthog-node). Every event in
 * docs/observability/05-analytics-event-catalog.md is captured through
 * `capture()` below, which only accepts a name + properties matching
 * analytics-events.ts's zod schema — a call site cannot pass an
 * unreviewed, unvalidated property (see 08-privacy-review.md's
 * "allow-list, not deny-list" enforcement). No-ops cleanly when
 * NEXT_PUBLIC_POSTHOG_KEY is unset, so local dev without a PostHog
 * project configured never errors.
 *
 * lib/observability/analytics-client.ts is the browser counterpart
 * (posthog-js) — this file cannot be imported from a Client Component
 * ("server-only" below enforces that at build time).
 */
import "server-only";
import { PostHog } from "posthog-node";
import { getObservabilityContext } from "./context";
import { ANALYTICS_EVENT_SCHEMAS, type AnalyticsEventName, type AnalyticsEventProperties } from "./analytics-events";

let client: PostHog | undefined;

function getClient(): PostHog | undefined {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return undefined;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.POSTHOG_HOST ?? "https://app.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

/** Captures one event server-side, tagged with the calling user's id
 * (falls back to the active correlation id if no user is resolved yet —
 * e.g. a sign-up event captured before the session exists) and the
 * active correlationId as an event property so a PostHog event can be
 * cross-referenced with logs/traces for the same request (see
 * docs/observability/09-correlation-id-strategy.md). Never awaited by
 * callers for response latency — posthog-node batches/flushes async;
 * Vercel Fluid Compute's waitUntil (via lib/observability/telemetry.ts's
 * shutdown hook) covers the tail flush on function suspend. */
export function capture<N extends AnalyticsEventName>(
  name: N,
  distinctId: string,
  properties: AnalyticsEventProperties<N>,
): void {
  const posthog = getClient();
  if (!posthog) return;
  const parsed = ANALYTICS_EVENT_SCHEMAS[name].parse(properties);
  const ctx = getObservabilityContext();
  posthog.capture({
    distinctId,
    event: name,
    properties: { ...parsed, correlation_id: ctx?.correlationId },
  });
}

/** Captures using the active context's userId, falling back to the
 * correlation id when no user is resolved (e.g. pre-session events) —
 * the common case for job/dispatcher call sites that don't have a
 * distinctId handy. */
export function captureFromContext<N extends AnalyticsEventName>(name: N, properties: AnalyticsEventProperties<N>): void {
  const ctx = getObservabilityContext();
  const distinctId = ctx?.userId ?? ctx?.correlationId ?? "anonymous";
  capture(name, distinctId, properties);
}

export function identify(userId: string, properties: { created_at?: string; plan?: string } = {}): void {
  const posthog = getClient();
  if (!posthog) return;
  posthog.identify({ distinctId: userId, properties });
}

/** Flushes any buffered events — call before a serverless function
 * suspends (lib/observability/telemetry.ts wires this into a shutdown
 * hook) since posthog-node's default batching otherwise risks losing
 * events on a cold function that never gets invoked again. */
export async function shutdownAnalytics(): Promise<void> {
  await client?.shutdown();
}
