/**
 * Domain event catalog — every event the job platform can dispatch or
 * subscribe to, with a zod schema for its payload. See
 * docs/job-platform/02-event-catalog.md for the full design rationale
 * (naming convention, idempotency keys, extension steps).
 *
 * Adding an event: add its name + schema here, then subscribe to it from
 * a function in lib/jobs/functions/*.ts and add that function to
 * registry.ts's aggregation list. Nothing else needs to change.
 */
import { z } from "zod";

const envelope = z.object({
  organizationId: z.string().optional(),
  correlationId: z.string(),
  priority: z.enum(["interactive", "normal"]).optional(),
  retryOf: z.string().optional(),
});

function event<T extends z.ZodRawShape>(shape: T) {
  return envelope.extend(shape);
}

export const EVENT_SCHEMAS = {
  "ledger/user.created": event({ userId: z.string(), email: z.string() }),

  "ledger/transaction.created": event({ transactionId: z.string() }),
  "ledger/transaction.imported": event({
    transactionIds: z.array(z.string()),
    sourceKind: z.string(),
    sourceId: z.string(),
  }),
  "ledger/transaction.classified": event({
    transactionId: z.string(),
    categoryId: z.string().nullable(),
    classificationSource: z.string().nullable(),
  }),

  "ledger/document.uploaded": event({
    documentId: z.string(),
    r2Key: z.string(),
    fileName: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number(),
  }),
  "ledger/document.parsed": event({
    documentId: z.string(),
    extractedTransactionIds: z.array(z.string()),
    parserUsed: z.string().nullable(),
  }),

  "ledger/email.imported": event({
    emailRecordId: z.string(),
    hasAttachments: z.boolean(),
  }),
  "ledger/email.parsed": event({
    emailRecordId: z.string(),
    matchedTransactionIds: z.array(z.string()),
  }),

  "ledger/merchant.normalized": event({
    merchantId: z.string(),
    transactionIds: z.array(z.string()),
  }),

  "ledger/workflow.trigger": event({
    trigger: z.string(),
    payload: z.record(z.string(), z.unknown()).default({}),
  }),
  "ledger/workflow.started": event({
    workflowRunId: z.string(),
    trigger: z.string(),
    workflowDefinitionId: z.string(),
  }),
  "ledger/workflow.completed": event({
    workflowRunId: z.string(),
    status: z.string(),
  }),

  "ledger/budget.updated": event({ budgetId: z.string(), categoryId: z.string(), status: z.string() }),
  "ledger/forecast.updated": event({ forecastSnapshotId: z.string(), generatedAtDate: z.string() }),
  "ledger/recurring.detected": event({
    recurringTransactionId: z.string(),
    merchantId: z.string().nullable(),
    status: z.string(),
  }),

  "ledger/feed.generated": event({ feedItemKeys: z.array(z.string()) }),

  "ledger/connection.created": event({ connectionId: z.string(), provider: z.string() }),
  "ledger/connection.disconnected": event({ connectionId: z.string(), provider: z.string() }),

  "ledger/sync.started": event({
    syncJobId: z.string().optional(),
    connectionId: z.string().optional(),
    providerId: z.string(),
    providerCategory: z.string(),
    runType: z.string(),
  }),
  "ledger/sync.completed": event({
    syncJobId: z.string(),
    itemsImported: z.number(),
    itemsSkipped: z.number(),
    duplicates: z.number(),
  }),
  "ledger/sync.failed": event({
    syncJobId: z.string(),
    errorClass: z.string(),
    message: z.string(),
  }),

  "ledger/notification.created": event({
    notificationCandidateId: z.string(),
    policyDecision: z.string(),
  }),

  "ledger/plugin.installed": event({ pluginName: z.string(), version: z.string() }),
  "ledger/plugin.enabled": event({ pluginName: z.string() }),
  "ledger/plugin.disabled": event({ pluginName: z.string() }),
  "ledger/plugin.health.requested": event({ pluginName: z.string() }),

  "ledger/analytics.aggregated": event({
    periodStart: z.string(),
    periodEnd: z.string(),
    aggregateIds: z.array(z.string()),
  }),
  "ledger/recommendation.generated": event({ recommendationId: z.string() }),

  "ledger/search.indexed": event({ objectType: z.string(), objectId: z.string() }),
  "ledger/semantic.indexed": event({ objectType: z.string(), objectId: z.string() }),

  "ledger/cleanup.requested": event({
    scope: z.enum(["sessions", "audit-logs", "expired-recommendations", "dismissed-feed"]),
  }),
  "ledger/summary.requested": event({
    scheduleType: z.enum(["MORNING_BRIEFING", "EVENING_BRIEFING", "WEEKLY_SUMMARY", "MONTHLY_SUMMARY"]),
    date: z.string(),
  }),
  "ledger/connection.validation.requested": event({ connectionId: z.string() }),

  // Internal cron-tick fan-out events — dispatched by scheduler.ts,
  // consumed by the per-org scheduled job functions.
  "ledger/schedule.recurring-detect": event({}),
  "ledger/schedule.forecast-refresh": event({}),
  "ledger/schedule.budget-recalculate": event({}),
  "ledger/schedule.analytics-refresh": event({}),
  "ledger/schedule.recommendation-generate": event({}),
} satisfies Record<string, z.ZodTypeAny>;

export type EventName = keyof typeof EVENT_SCHEMAS;
export type EventPayload<N extends EventName> = z.infer<(typeof EVENT_SCHEMAS)[N]>;

export function parseEventPayload<N extends EventName>(name: N, data: unknown): EventPayload<N> {
  return EVENT_SCHEMAS[name].parse(data) as EventPayload<N>;
}
