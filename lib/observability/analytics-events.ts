/**
 * Analytics event catalog — see docs/observability/05-analytics-event-catalog.md
 * for the trigger point and rationale behind every event. Each event has a
 * zod schema for its properties, mirroring lib/jobs/events.ts's pattern for
 * the Inngest event catalog. No dependency on "server-only" or any Next.js
 * API — safe to import from both lib/observability/analytics.ts (server,
 * posthog-node) and lib/observability/analytics-client.ts (browser,
 * posthog-js), which is the whole point of splitting it out: one typed
 * capture() call site can't pass an unreviewed property, satisfying
 * docs/observability/08-privacy-review.md's "allow-list, not deny-list"
 * enforcement mechanism for analytics events.
 */
import { z } from "zod";

function event<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape);
}

export const ANALYTICS_EVENT_SCHEMAS = {
  user_signed_up: event({ signup_method: z.enum(["email", "google"]) }),
  user_logged_in: event({ login_method: z.enum(["email", "google"]) }),
  user_logged_out: event({}),

  provider_connected: event({ provider: z.enum(["google", "microsoft", "yahoo"]), connection_id: z.string() }),
  provider_disconnected: event({
    provider: z.enum(["google", "microsoft", "yahoo"]),
    connection_id: z.string(),
    reason: z.enum(["user_initiated", "revoked", "expired"]),
  }),
  provider_reconnected: event({ provider: z.enum(["google", "microsoft", "yahoo"]), connection_id: z.string() }),
  provider_token_refresh_failed: event({ provider: z.enum(["google", "microsoft", "yahoo"]), connection_id: z.string() }),

  transaction_imported: event({ provider: z.string(), count: z.number(), source: z.enum(["bank", "sms", "email"]) }),

  document_imported: event({ document_type: z.string().optional(), size_bucket: z.enum(["small", "medium", "large"]) }),
  document_parse_failed: event({ document_id: z.string(), failure_reason: z.string() }),

  email_imported: event({ count: z.number(), provider: z.literal("gmail") }),

  sync_started: event({ provider: z.string(), sync_type: z.string() }),
  sync_completed: event({ provider: z.string(), sync_type: z.string(), duration_ms: z.number(), items_synced: z.number() }),
  sync_failed: event({ provider: z.string(), sync_type: z.string(), failure_reason: z.string() }),

  ai_conversation_started: event({ session_id: z.string() }),
  ai_conversation_message_sent: event({ session_id: z.string(), message_count: z.number() }),

  search_performed: event({ result_count: z.number(), search_type: z.enum(["transactions", "documents", "global"]) }),

  budget_created: event({ budget_id: z.string(), period: z.string() }),
  budget_updated: event({ budget_id: z.string() }),
  goal_created: event({ goal_id: z.string(), goal_type: z.string() }),

  dashboard_viewed: event({ widget_count: z.number().optional() }),
  insight_viewed: event({ insight_type: z.string().optional() }),
  forecast_viewed: event({}),

  settings_updated: event({ settings_section: z.string() }),

  plugin_enabled: event({ plugin_id: z.string(), plugin_version: z.string().optional() }),
  plugin_disabled: event({ plugin_id: z.string() }),
  plugin_health_degraded: event({ plugin_id: z.string(), status: z.string() }),

  workflow_created: event({ workflow_id: z.string(), trigger_type: z.string() }),
  workflow_executed: event({
    workflow_id: z.string(),
    status: z.string(),
    duration_ms: z.number(),
    dependent_job_count: z.number().optional(),
  }),

  recurring_detected: event({ count: z.number() }),
  merchant_normalized: event({ count: z.number() }),

  connection_hub_viewed: event({ active_connection_count: z.number().optional() }),
  admin_observability_viewed: event({ role: z.string() }),
} satisfies Record<string, z.ZodTypeAny>;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENT_SCHEMAS;
export type AnalyticsEventProperties<N extends AnalyticsEventName> = z.infer<(typeof ANALYTICS_EVENT_SCHEMAS)[N]>;

/** Events captured server-side by default (dispatched from a Server
 * Action, Route Handler, or Inngest job) vs. client-side (page views,
 * UI-only interactions) — see 05-analytics-event-catalog.md's "Server-side
 * vs. client-side capture" section. Purely documentation/routing metadata;
 * both analytics.ts and analytics-client.ts can capture any event name,
 * this just records the intended default for each. */
export const SERVER_SIDE_EVENTS = new Set<AnalyticsEventName>([
  "user_signed_up",
  "user_logged_in",
  "provider_connected",
  "provider_disconnected",
  "provider_reconnected",
  "provider_token_refresh_failed",
  "transaction_imported",
  "document_imported",
  "document_parse_failed",
  "email_imported",
  "sync_started",
  "sync_completed",
  "sync_failed",
  "budget_created",
  "goal_created",
  "settings_updated",
  "plugin_enabled",
  "plugin_disabled",
  "plugin_health_degraded",
  "workflow_created",
  "workflow_executed",
  "recurring_detected",
  "merchant_normalized",
]);
