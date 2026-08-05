# 7. Idempotency Design

## 7.1 Two-layer defense, always both

Every job type gets **both** layers below. Neither is sufficient alone:

- **Layer 1 — broker-level** (Inngest event `id` dedup + function `idempotency` config, [04](./04-queue-strategy.md) §4.6): prevents duplicate *executions* from duplicate or near-duplicate events. Does not protect against a manual dead-letter retry, an operator resending an event with a deliberately fresh id, or a bug that calls the underlying service function directly instead of through the event system.
- **Layer 2 — database-level** (unique constraint + upsert, or an explicit pre-check inside the function before any write): prevents duplicate *rows* regardless of how many times the write path executes. This is the layer that actually satisfies "repeated execution must never create duplicate transactions, notifications, workflows, feed items, or documents" — layer 1 is a performance/cost optimization on top of it, not a substitute.

## 7.2 Per-model idempotency design

### Transactions
**Gap:** `Transaction` has no natural unique constraint (confirmed in schema — dedup today is application logic in `lib/import/*`, not DB-enforced).
**Design:** Import/creation jobs (`ledger/transaction.imported`) carry `TransactionSource.[kind, sourceId]` as the caller-supplied dedup signal — before inserting, the job queries for an existing `TransactionSource` row matching `(kind, sourceId)` and skips creation if found, exactly mirroring what `services/transactions/transaction-service.ts::createTransactions` already does synchronously today (the job wraps this existing function unchanged — see [01](./01-architecture-diagram.md), business logic is preserved, not reimplemented). Classification jobs (`classification` function) never insert a `Transaction` — they only `UPDATE ... SET aiCategoryId = ?, classificationSource = ?`, which is naturally idempotent (re-running with the same input produces the same row state, not a new row).

### Documents
**Gap:** No unique constraint; `isDuplicate`/`duplicateOfId` self-relation exists but is populated by application logic (`services/documents/document-service.ts::findDuplicate`), same pattern as transactions.
**Design:** The `Document` row is **always created synchronously** by `app/api/documents/upload` before any job runs (the upload route already does this today via `recordDocument`) — `document-parse` never creates a `Document`, it only reads `event.data.documentId` and updates that specific row's `status`/`parserUsed`/extracted fields. Since the row already exists and the job only updates a known primary key, re-running `document-parse` for the same `documentId` (broker retry, manual dead-letter retry, or a duplicate event) converges to the same final state — a pure idempotent update, not an insert. `findDuplicate` dedup (near-duplicate document *content*, not duplicate *processing*) remains exactly as it is today, called once inside the job the same way it's called today.

### Emails
**Strong existing key:** `EmailRecord.[organizationId, providerId, externalId]` — the provider's own message id is the natural idempotency key.
**Design:** `sync-run`'s email path always **upserts** on this composite key (`prisma.emailRecord.upsert(...)`), never a bare `create`. Reprocessing the same provider message (pagination overlap during a resumed sync, a retried step, a re-dispatched event) converges to the same row rather than duplicating it. `ledger/email.imported` is only dispatched when the upsert's result indicates a genuinely new record (Prisma's upsert doesn't natively report insert-vs-update, so the job checks `createdAt === updatedAt` on the returned row, or issues a `findFirst` immediately before the upsert within the same step — chosen at implementation time) — this prevents the downstream fan-out chain (document-parse, merchant-normalize, classification, ...) from re-running for an already-processed email just because the sync step itself was retried.

### Workflow Runs
**Strong existing key:** `WorkflowRun.inngestEventId` (unique, nullable — the field the schema already anticipated, currently unused).
**Design:** `workflow-execute` sets `inngestEventId = event.id` (Inngest's own event id, available inside the function context) at creation time, via `prisma.workflowRun.create(...)` guarded by a preceding `findUnique({ where: { inngestEventId } })` check (or a straight `create` relying on the unique constraint to throw on conflict, caught and treated as "already handled, return existing run" — both are valid; the constraint is what makes either approach safe). This directly closes the gap the schema comment implies: no writer exists today.

### Budgets
**Strong existing key:** `Budget.[organizationId, categoryId]`.
**Design:** `budget-recalculate` always upserts on this key — matches `services/budgets/budget-service.ts`'s existing `addBudget`/`updateBudgetLimit` shape.

### Forecast Snapshots
**Strong existing key:** `ForecastSnapshot.[organizationId, generatedAt]`.
**Design:** The job **truncates `generatedAt` to the day** (`new Date(now.toISOString().slice(0, 10))`) before writing, rather than using the exact execution timestamp — so a retried or manually re-triggered forecast refresh on the same calendar day upserts the same row instead of creating a second snapshot for that day. This is a deliberate interpretation choice (the constraint alone would still allow multiple snapshots per day if two different exact timestamps were used) — documented here so implementation doesn't accidentally pass a raw `new Date()`.

### Recurring Transactions
**Gap:** No unique constraint on `RecurringTransaction`.
**Design:** `recurring-detect` calls the existing `services/recurring/recurring-service.ts::detectAndReconcileRecurring` unchanged — this function's name already signals it's a reconcile-not-create operation; the job's only new responsibility is *not* to bypass it with a raw create anywhere in the job path. The service is trusted as the sole write path (consistent with [01](./01-architecture-diagram.md)'s "call into services, don't reimplement" principle) — no additional DB-level guarantee is added at the job layer beyond what the service already provides, because duplicating its matching logic (merchant + frequency comparison) in the job would be exactly the kind of reimplementation this platform is designed to avoid.

### Feed Items
**Strong existing key, canonical pattern:** `FeedItem.[organizationId, key]` where `key` is a deterministic composite string.
**Design:** `feed-generate` always upserts by `key`, following the pattern the schema already establishes (e.g. `"feed:budget:warning:${statusId}"`). This is the model this whole design's idempotency approach is named after — every other "no natural key" case above is solved by either using an existing service's guarded write path or introducing an equivalent deterministic composite key at the job layer.

### Connections
**Strong existing key:** `Connection.[userId, provider, providerAccountId]`.
**Design:** `connection-validate` and disconnect handling only ever `UPDATE` an existing `Connection` row located by primary key (`connectionId` from the event payload) — never re-creates one. Disconnect is itself idempotent by design already (documented in `lib/connections/` per the research: disconnect wipes `tokens: Json?` rather than deleting the row), so a duplicate `ledger/connection.disconnected` dispatch converges safely.

### Sync Jobs
**Gap:** No unique constraint, and (per research) no existing guard against two overlapping runs for the same connection/provider.
**Design:** Two guarantees, one per layer:
- Layer 1: the `providerMutex` concurrency constraint ([04](./04-queue-strategy.md) §4.2, key = `organizationId:providerId`, limit 1) prevents Inngest from even starting a second concurrent `sync-run` invocation for the same provider.
- Layer 2: `sync-run`'s first step explicitly queries for an existing `SyncJob` with `status IN ("PENDING", "RUNNING")` for the same `(organizationId, providerId)` before creating a new row; if found, the function short-circuits and exits cleanly (not an error — this is the expected outcome of a duplicate scheduled-poll dispatch racing a still-running manual sync). This is deliberately redundant with Layer 1 — Layer 1 can theoretically be bypassed by a config change or an Inngest platform edge case, and a duplicate concurrent `SyncJob` row would silently corrupt `lastCheckpoint` semantics, which is judged bad enough to warrant the belt-and-suspenders check.

### Notifications
**Strong existing key:** `NotificationCandidate.cooldownKey` (unique per org via `NotificationCooldown.[organizationId, cooldownKey]`).
**Design:** `notification-generate` computes the same `cooldownKey` the existing `lib/policy/cooldown.ts` logic already derives (unchanged), and checks `NotificationCooldown` before creating a `NotificationCandidate` — this is the existing cooldown mechanism, not a new one; the job is a new *caller* of it, not a reimplementation. `notification-deliver` additionally checks for an existing `NotificationDelivery` row for the same `(notificationCandidateId, channel)` before sending, closing the one gap noted in the original research (no existing pre-check against double-send was confirmed to exist).

### Plugins
**Design:** `PluginRegistryEntry` is keyed by `name` (schema-confirmed) — install/enable/disable jobs always upsert by `name`, never insert blindly.

### Briefings / Summaries
**Strong existing key, exact match:** `BriefingDeliveryLog.[organizationId, scheduleType, date]`.
**Design:** `summary-generate` checks this table before doing any work (not just before the final write) — since summary generation itself may be non-trivial (assembling coach/feed data), the idempotency check happens as the very first step, so a duplicate dispatch is a cheap no-op rather than redoing the assembly work and discarding it at write time.

## 7.3 What "idempotent" does NOT mean here

Idempotent does not mean "safe to run concurrently forever with no coordination" — it means **repeated sequential (or overlapping-but-eventually-consistent) execution converges to the same end state without duplicating rows**. The `providerMutex` in §4.2 exists precisely because some operations (paginated sync writing a checkpoint) are idempotent *per page* but not safely concurrent with themselves — two simultaneous `sync-run` invocations for the same connection could each read the same stale `lastCheckpoint`, advance it independently, and silently skip or double-import a page. Idempotency (this document) and concurrency control ([04](./04-queue-strategy.md)) are complementary, not substitutes for each other.
