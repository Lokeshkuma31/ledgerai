/**
 * PostHog product analytics — browser side (posthog-js). Counterpart to
 * analytics.ts (server, posthog-node); see
 * docs/observability/05-analytics-event-catalog.md for which events are
 * captured from which side. No "server-only"/"use client" pragma needed
 * — this module exports plain functions, not a component; call it from
 * inside Client Components (page-view effects, UI interaction handlers).
 */
import posthog from "posthog-js";
import { ANALYTICS_EVENT_SCHEMAS, type AnalyticsEventName, type AnalyticsEventProperties } from "./analytics-events";

let initialized = false;

/** Call once, e.g. from a top-level Client Component in app/layout.tsx.
 * No-ops if NEXT_PUBLIC_POSTHOG_KEY is unset (local dev without a
 * PostHog project) or if called more than once (React StrictMode double-
 * invoke safety). */
export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  posthog.init(key, {
    api_host: process.env.POSTHOG_HOST ?? "https://app.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false, // dashboard_viewed/insight_viewed/etc. are captured explicitly at their own trigger points, not on every route change.
  });
  initialized = true;
}

export function captureClient<N extends AnalyticsEventName>(name: N, properties: AnalyticsEventProperties<N>): void {
  if (!initialized) return;
  const parsed = ANALYTICS_EVENT_SCHEMAS[name].parse(properties);
  posthog.capture(name, parsed);
}

export function identifyClient(userId: string, properties: { created_at?: string; plan?: string } = {}): void {
  if (!initialized) return;
  posthog.identify(userId, properties);
}

export function resetAnalytics(): void {
  if (!initialized) return;
  posthog.reset();
}
