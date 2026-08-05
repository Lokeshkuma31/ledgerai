# 2. Event Catalog

## 2.1 Naming convention

`ledger/<domain>.<event>` — lowercase, dot-separated event name within a domain namespace, all defined as `const` in `lib/jobs/events.ts` (never inline string literals at call sites). Every event carries:

```ts
{
  name: string;            // "ledger/document.uploaded"
  data: { organizationId: string; ...domainFields; correlationId: string };
  ts?: number;              // Inngest-native, set automatically
}
```

`correlationId` is generated at the *original* trigger (the first event in a chain) and threaded through every downstream event's payload unchanged, so a single user action's full fan-out (e.g. one email import triggering nine downstream jobs) can be traced end to end in `JobRun.correlationId` — see [08](./08-worker-architecture.md) §8.4.

`events.ts` exports a `zod` schema per event and a single `EventSchemas` map passed to the Inngest client constructor in `engine.ts` (Inngest's native `EventSchemas.fromZod(...)`), so every `dispatcher.dispatch()` call and every function's event handler is fully typed and validated at the boundary — a malformed payload fails at dispatch time, not inside a worker.

## 2.2 Catalog

| Event | Payload (beyond `organizationId`, `correlationId`) | Triggered by | Primary consumer(s) | Idempotency key |
|---|---|---|---|---|
| `ledger/user.created` | `userId`, `email` | Better Auth post-signup hook / `app/api/auth/[...all]` | `user-onboarding` (seed `UserPreferences`, welcome notification) | `user-created-${userId}` |
| `ledger/transaction.created` | `transactionId` | `services/transactions/transaction-service.ts::createTransaction` | `classification`, `budget-recalculate`, `feed-generate` | `event.data.transactionId` (function-level `idempotency`) |
| `ledger/transaction.imported` | `transactionIds: string[]`, `sourceKind`, `sourceId` | `services/transactions/transaction-service.ts::createTransactions` (batch), `lib/import/*` | `merchant-normalize` (batch), `classification` (fan-out per id), `feed-generate` | `${sourceKind}-${sourceId}` |
| `ledger/transaction.classified` | `transactionId`, `categoryId`, `classificationSource` | `classification` function, on completion | `workflow-execute`, `feed-generate`, `analytics-refresh` | `event.data.transactionId` |
| `ledger/document.uploaded` | `documentId`, `r2Key` | `app/api/documents/upload` (after client confirms the R2 PUT completed — new confirm step, see [07](./07-idempotency-design.md)) | `document-parse` | `event.data.documentId` |
| `ledger/document.parsed` | `documentId`, `extractedTransactionIds: string[]`, `parserUsed` | `document-parse` function, on completion | `merchant-normalize`, `search-index` | `event.data.documentId` |
| `ledger/email.imported` | `emailRecordId`, `hasAttachments: boolean` | `email-sync` function, per new non-duplicate `EmailRecord` | `document-parse` (if attachments), `merchant-normalize`, `classification` | `event.data.emailRecordId` (matches `EmailRecord`'s own unique key transitively) |
| `ledger/email.parsed` | `emailRecordId`, `matchedTransactionIds: string[]` | `email-sync` matcher step | `classification`, `feed-generate` | `event.data.emailRecordId` |
| `ledger/merchant.normalized` | `merchantId`, `transactionIds: string[]` | `merchant-normalize` function | `classification`, `search-index` | `merchant-normalize-${merchantId}-${batchHash}` |
| `ledger/workflow.started` | `workflowRunId`, `trigger: WorkflowTrigger`, `workflowDefinitionId` | `workflow-execute` function, before first step | (observability only — `metrics.ts`) | `event.data.workflowRunId` (equals Inngest `event.id` — see [07](./07-idempotency-design.md)) |
| `ledger/workflow.completed` | `workflowRunId`, `status: WorkflowRunStatus` | `workflow-execute` function, after last step | `feed-generate`, `notification-generate` | `event.data.workflowRunId` |
| `ledger/budget.updated` | `budgetId`, `categoryId`, `status` | `budget-recalculate` function | `feed-generate`, `notification-generate` (threshold breach) | `budget-recalc-${organizationId}-${categoryId}` |
| `ledger/forecast.updated` | `forecastSnapshotId`, `generatedAtDate` (day-truncated) | `forecast-refresh` function | `feed-generate` | `forecast-${organizationId}-${generatedAtDate}` |
| `ledger/recurring.detected` | `recurringTransactionId`, `merchantId`, `status` | `recurring-detect` function | `feed-generate`, `notification-generate` | `recurring-${organizationId}-${merchantId}-${frequency}` |
| `ledger/feed.generated` | `feedItemKeys: string[]` | `feed-generate` function, on completion | `notification-generate` (evaluates new/changed feed items), `search-index` | `feed-generate-${organizationId}-${triggerCorrelationId}` |
| `ledger/connection.created` | `connectionId`, `provider` | `services/connections/*` (OAuth callback completion) | `sync-start` (initial sync), `workflow-execute` (`account-connected` trigger) | `event.data.connectionId` |
| `ledger/connection.disconnected` | `connectionId`, `provider` | Disconnect Server Action | `cleanup` (revoke cached tokens' downstream state), `workflow-execute` (`disconnect` trigger) | `event.data.connectionId` |
| `ledger/sync.started` | `syncJobId`, `connectionId?`, `providerId`, `providerCategory`, `runType` | Cron (`scheduler.ts`) or manual "sync now" action | `email-sync` \| `bank-sync` (routed by `providerCategory`) | see [04](./04-queue-strategy.md) — mutex on `${organizationId}:${providerId}` |
| `ledger/sync.completed` | `syncJobId`, counters (`itemsImported`, `itemsSkipped`, `duplicates`) | `email-sync` / `bank-sync`, on success | `workflow-execute` (`sync-completed` trigger), `feed-generate` | `event.data.syncJobId` |
| `ledger/sync.failed` | `syncJobId`, `errorClass`, `message` | `email-sync` / `bank-sync`, on permanent failure | `workflow-execute` (`sync-failed` trigger), `notification-generate` | `event.data.syncJobId` |
| `ledger/notification.created` | `notificationCandidateId`, `policyDecision` | `notification-generate` function | `notification-deliver` (if `NOTIFY_IMMEDIATELY`) | `event.data.notificationCandidateId` (matches `NotificationCandidate.cooldownKey` check — see [07](./07-idempotency-design.md)) |
| `ledger/plugin.installed` | `pluginName`, `version` | `services/plugins/plugin-service.ts::registerPluginState` | `plugin-health-check` (initial check) | `plugin-installed-${pluginName}-${version}` |
| `ledger/plugin.enabled` | `pluginName` | Plugin management action | `plugin-health-check` | `plugin-enabled-${pluginName}` |
| `ledger/plugin.disabled` | `pluginName` | Plugin management action | `cleanup` (deregister scheduled health checks) | `plugin-disabled-${pluginName}` |
| `ledger/document.ocr.completed` | `documentId`, `extractedFields: Json` | `document-parse` function's OCR step | `document-parse` (continues same function — internal step event only where async provider callback is involved) | `event.data.documentId` |
| `ledger/analytics.aggregated` | `periodStart`, `periodEnd`, `aggregateIds: string[]` | `analytics-refresh` function | `feed-generate` (analytics-derived insights) | `analytics-${organizationId}-${periodStart}` |
| `ledger/recommendation.generated` | `recommendationId` | `recommendation-generate` function | `notification-generate`, `feed-generate` | `event.data.recommendationId` |
| `ledger/search.indexed` | `objectType`, `objectId` | `search-index` function | (terminal — observability only) | `search-index-${objectType}-${objectId}` |
| `ledger/semantic.indexed` | `objectType`, `objectId` | `semantic-index` function | (terminal — observability only) | `semantic-index-${objectType}-${objectId}` |
| `ledger/cleanup.requested` | `scope: "sessions" \| "audit-logs" \| "expired-recommendations" \| "dismissed-feed"` | Cron (`scheduler.ts`, daily) | `cleanup` function | `cleanup-${scope}-${dateBucket}` |
| `ledger/summary.requested` | `scheduleType: BriefingScheduleType`, `date` (day-truncated) | Cron (`scheduler.ts`, hourly tick fan-out — see [06](./06-scheduling-strategy.md)) | `summary-generate` | `${organizationId}-${scheduleType}-${date}` (matches `BriefingDeliveryLog` unique key exactly) |
| `ledger/connection.validation.requested` | `connectionId` | Cron (`scheduler.ts`, hourly) | `connection-validate` | `connection-validate-${connectionId}-${hourBucket}` |
| `ledger/plugin.health.requested` | `pluginName` | Cron (`scheduler.ts`, every 30 min) | `plugin-health-check` | `plugin-health-${pluginName}-${halfHourBucket}` |

## 2.3 Extending the catalog

Adding a new event is three steps, none of which touch `dispatcher.ts`, `registry.ts`'s iteration logic, or any existing function:

1. Add the event name constant + zod schema to `events.ts`.
2. Add a `createFunction` in the relevant domain file under `lib/jobs/functions/<domain>.ts`, subscribed via `{ event: "ledger/whatever.happened" }`.
3. Import that function file from `registry.ts`'s aggregation list (a flat array export, e.g. `export const functions = [...emailFunctions, ...documentFunctions, ...]`).

This mirrors the extensibility the codebase already uses for `WorkflowTrigger` (`types/workflow.ts`) and `WorkflowEngine` — the job platform's event catalog is the async-execution analogue of that trigger union, not a competing taxonomy. Where a domain event name overlaps a `WorkflowTrigger` value conceptually (e.g. `sync-completed` the trigger vs. `ledger/sync.completed` the event), the job platform event is what fires the `workflow-execute` function, which internally maps to the matching `WorkflowTrigger` — the two are related but distinct: one is Inngest's routing key, the other is `WorkflowDefinition.trigger`'s matching key.
