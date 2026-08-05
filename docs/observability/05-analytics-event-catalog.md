# 05 — Analytics Event Catalog

## Principle

PostHog events describe **user/system actions**, never financial values. Amounts, balances, transaction descriptions, merchant names tied to spend, and document/email content never appear in event properties — see [08-privacy-review](./08-privacy-review.md). Where an event's natural subject is a domain object (a transaction, a document), the event carries only its **id, type, and metadata** (count, provider, duration, status), never its content.

Event names follow `object_verb` snake_case (PostHog convention). Where an event mirrors an existing Inngest event from `lib/jobs/events.ts` (the `ledger/*` namespace), the analytics event is captured **from the same code path that dispatches the Inngest event**, not duplicated logic — see the "Inngest event" column.

## Catalog

| Event | Trigger | Key properties | Inngest event (if any) |
|---|---|---|---|
| `user_signed_up` | Better Auth sign-up hook (`lib/auth/better-auth.ts`) completes | `signup_method` (`email`\|`google`) | — |
| `user_logged_in` | Better Auth sign-in success | `login_method` | — |
| `user_logged_out` | Sign-out action | — | — |
| `provider_connected` | `lib/connections/engine.ts` completes OAuth callback successfully | `provider` (`google`\|`microsoft`\|`yahoo`), `connection_id` | `ledger/connection.created` |
| `provider_disconnected` | Connection Hub disconnect action | `provider`, `connection_id`, `reason` (`user_initiated`\|`revoked`\|`expired`) | `ledger/connection.disconnected` |
| `provider_reconnected` | Connection Hub reconnect flow | `provider`, `connection_id` | — |
| `provider_token_refresh_failed` | `lib/connections/token-manager.ts` refresh failure | `provider`, `connection_id` | — |
| `transaction_imported` | Sync/job pipeline lands new transactions | `provider`, `count`, `source` (`bank`\|`sms`\|`email`) | `ledger/transaction.created` (per-transaction fan-out; the analytics event is batched per sync run, not per transaction) |
| `document_imported` | `app/api/documents/[id]/confirm/route.ts` finalizes an upload | `document_type` (if classified), `size_bucket` (`small`\|`medium`\|`large`, not exact bytes) | `ledger/document.uploaded` |
| `document_parse_failed` | `lib/jobs/functions/documents.ts`'s `documentParse` job fails | `document_id`, `failure_reason` (error code, not raw parser output) | — |
| `email_imported` | Gmail plugin sync run completes | `count`, `provider="gmail"` | — |
| `sync_started` | `lib/jobs/functions/sync.ts`'s `syncStart` dispatches | `provider`, `sync_type` | `ledger/sync.started` |
| `sync_completed` | `syncRun` completes successfully | `provider`, `sync_type`, `duration_ms`, `items_synced` | `ledger/sync.completed` |
| `sync_failed` | `syncRun` fails / exhausts retries | `provider`, `sync_type`, `failure_reason` | `ledger/sync.failed` |
| `ai_conversation_started` | First message in a new AI Coach session (`lib/coach/*`) | `session_id` | — |
| `ai_conversation_message_sent` | Each subsequent message | `session_id`, `message_count` | — |
| `search_performed` | `/search` query submitted | `result_count`, `search_type` (`transactions`\|`documents`\|`global`) — never the query string itself | — |
| `budget_created` | Budget creation action | `budget_id`, `period` (`monthly`\|`weekly`\|custom) — never the budget amount | — |
| `budget_updated` | Budget edit action | `budget_id` | — |
| `goal_created` | Goal creation action | `goal_id`, `goal_type` | — |
| `dashboard_viewed` | `/dashboard` page view | `widget_count` | — |
| `insight_viewed` | `/insights` page view or specific insight expanded | `insight_type` | — |
| `forecast_viewed` | `/forecast` page view | — | — |
| `settings_updated` | Any settings mutation | `settings_section` (`profile`\|`notifications`\|`security`\|…) — never the new value | — |
| `plugin_enabled` | `lib/plugins/lifecycle.ts` enable | `plugin_id`, `plugin_version` | `ledger/plugin.enabled` |
| `plugin_disabled` | `lib/plugins/lifecycle.ts` disable | `plugin_id` | `ledger/plugin.disabled` |
| `plugin_health_degraded` | `pluginHealthCheck` job detects unhealthy plugin | `plugin_id`, `status` | `ledger/plugin.health.requested` (trigger side) |
| `workflow_created` | Workflow builder save | `workflow_id`, `trigger_type` | — |
| `workflow_executed` | `workflowExecute` job completes | `workflow_id`, `status`, `duration_ms`, `dependent_job_count` | `ledger/workflow.completed` |
| `recurring_detected` | `recurringDetect` scheduled job finds a new recurring pattern | `count` | — |
| `merchant_normalized` | `merchantNormalize` job runs | `count` | — |
| `connection_hub_viewed` | `/connections` page view | `active_connection_count` | — |
| `admin_observability_viewed` | `/admin/observability` page view | `role` | — |

## Server-side vs. client-side capture

- **Client-side (`posthog-js`, `lib/observability/analytics.ts`'s browser export)**: page views (`dashboard_viewed`, `insight_viewed`, `forecast_viewed`, `connection_hub_viewed`, `admin_observability_viewed`), UI-only interactions (`search_performed`, `ai_conversation_message_sent`).
- **Server-side (`posthog-node`, same module's server export)**: anything triggered from a Server Action, Route Handler, or Inngest job — `provider_connected/disconnected`, `sync_*`, `document_*`, `plugin_*`, `workflow_executed`, `budget_created`, `goal_created`, `settings_updated`, `user_signed_up/logged_in`. Server-side capture is preferred whenever the triggering code already runs server-side (avoids trusting the client to fire the event, and avoids exposing internal ids to the browser bundle unnecessarily).

Every server-side capture call includes `distinctId` (the user id) and, where relevant, `correlationId` as a property so a PostHog event can be cross-referenced with logs/traces for the same request — see [09](./09-correlation-id-strategy.md).

## Identify calls

`analytics.ts` calls PostHog's `identify()` once per session (on login / session resume), setting only non-sensitive profile properties (`created_at`, `plan` if applicable) — never email as a person property beyond what PostHog needs for the distinct ID linkage, and never financial data.
