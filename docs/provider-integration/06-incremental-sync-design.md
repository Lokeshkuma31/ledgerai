# 6. Incremental Sync Design

## 6.1 The existing cursor/checkpoint contract this design fills in

`lib/sync/types.ts` already defines the exact shapes every provider's incremental sync must produce — this document does not invent new state, it specifies what each provider puts into state that already exists:

- **`SyncCursor`** (`lib/sync/types.ts:82-85`): `{value: string | null, updatedAt}` — "a provider's own position in its data stream... lastSyncToken, lastCursor, lastMessageId... all represented the same opaque-string way so the engine never needs to know which one a given provider actually uses."
- **`SyncJob.lastCheckpoint`** (Prisma `Json?`, `prisma/schema.prisma:361`) — set when a run stops before reaching the end of available data (cancelled, self-imposed batch limit, or a genuine failure mid-page), letting the next run resume rather than restart.
- **`SyncExecutionInput.checkpoint`** / **`SyncExecutionResult.nextCursor`/`.checkpoint`** (`lib/sync/types.ts:92-114`) — the request/response envelope `lib/sync/executor.ts` (legacy in-memory engine) already uses. **Correction to an earlier draft**: the real Inngest path (`lib/jobs/functions/sync.ts`'s `syncRun`) does **not** yet read `job.lastCheckpoint` anywhere — today it only ever initializes the field to `null` when it creates a new `SyncJob` row (`sync.ts:90`) and never reads it back. Resuming from a checkpoint is exactly what the function's own deferred-work comment (`sync.ts:98-103`: "real provider sync would run here, paginating with `job.lastCheckpoint`...") marks as not-yet-built. This document's checkpoint contract (§6.2–§6.7) is therefore new implementation work inside the real provider's `sync.ts` bridge, not an existing mechanism being extended — flagged clearly here so the scope isn't underestimated.

Every provider below is specified purely in terms of: what goes into the opaque `cursor`/`checkpoint` string, how a resume reads it, and what "caught up" means.

## 6.2 Gmail — History API

- **Cursor**: Gmail's `historyId`, a monotonically increasing string Gmail assigns per mailbox. Stored as `SyncJob.metadata.historyId` at the end of every successful run (not `lastCheckpoint`, which is reserved for **mid-run** pagination position — see 6.2.1) and denormalized onto `Connection.metadata` for the next run to read without querying job history.
- **Initial sync**: `messages.list` with no `historyId` — full mailbox listing, paginated via `pageToken`. The **first** successful full listing's response includes the mailbox's current `historyId`, which becomes the seed for every subsequent incremental run.
- **Incremental sync**: `history.list(startHistoryId=<stored historyId>)` — returns only `messagesAdded`/`messagesDeleted`/`labelsAdded`/`labelsRemoved` since that point. This is a materially cheaper call than re-listing the mailbox, and is why Gmail is the only provider in this plan with true "no re-download" incremental sync.
- **Gap Gmail itself imposes**: `historyId` values expire — Gmail documents that history is retained for a limited window (commonly ~7 days in practice, not contractually guaranteed) and a `history.list` call against an expired `startHistoryId` returns HTTP 404. **This must be treated as a distinct, expected condition, not a generic failure**: on a 404 specifically from `history.list` (never `messages.get`, where 404 means "message not found" — see `04-retry-strategy.md` §4.3's HTTP 404 → permanent mapping, which is correct for the message-not-found case but wrong here), fall back to a fresh full listing and treat it as a new `initial`-type `SyncJob`, not a failure. This distinction belongs entirely inside the Gmail provider service — the generic classifier and the Sync Engine never see a "history expired" concept.
- **Mid-run checkpoint (6.2.1)**: within one `history.list` pagination sequence (its own `pageToken`, independent of `historyId`), `SyncJob.lastCheckpoint` stores that `pageToken` — a run cancelled or crashed mid-page resumes from there without re-processing already-imported messages, per `services/email/email-import-service.ts::recordEmail`'s existing per-message idempotency (matched by `EmailRecord.[providerId, externalId]`, already the case for the mock provider's fixtures).

## 6.3 Outlook — Delta Query

- **Cursor**: the full `@odata.deltaLink` URL Graph returns at the end of a delta page sequence — stored as-is (it is itself an opaque token from the app's perspective, encoding both position and query parameters) in `SyncJob.metadata.deltaLink`.
- **Initial sync**: `GET /me/mailFolders/inbox/messages/delta` with no prior state — Graph paginates via `@odata.nextLink` until it returns `@odata.deltaLink` instead, marking "caught up."
- **Incremental sync**: `GET <stored deltaLink>` — Graph returns only changes (additions, updates, **and deletions**, unlike Gmail's separate `messagesDeleted` array) since that link was issued.
- **Deletion handling**: unlike Gmail, a Graph delta response can include a `@removed` entry for a message — mapped to marking the corresponding `EmailRecord.status` in a way that removes its contribution from any linked transaction count, without deleting the `EmailRecord` itself (append-only history is preserved, matching `AuditLog`/`SyncHistoryEvent`'s existing pattern elsewhere in the codebase).
- **Delta link expiry**: Graph delta links can also expire or become invalid (mailbox migration, extended inactivity) — returned as HTTP 410 Gone specifically (distinct from Gmail's overloaded 404), making this actually easier to special-case correctly than Gmail's history expiry. On 410, fall back to a fresh delta query from scratch, same "treat as new initial sync" handling as 6.2.

## 6.4 Yahoo — pagination-based, no delta

Per `05-provider-capability-matrix.md` §5.2's approximation rule: Yahoo has no native delta mechanism (confirmed absence, not merely undocumented — Yahoo Mail's consumer API surface, once partner-approved, is expected to expose only IMAP-style or basic REST listing per publicly available Yahoo developer documentation as of this design's writing; **must be re-verified against the actual partner API docs once approval lands**, since this is the one provider whose capabilities are not independently confirmed).

- **Cursor**: the `receivedAt` timestamp of the most-recently-processed message.
- **Incremental sync**: list messages with a `since`/`after`-style filter (exact parameter name TBD pending partner docs) newer than the stored timestamp, paginated by offset.
- **Accepted limitation**: as noted in `05-provider-capability-matrix.md` §5.2, a backdated or delayed-delivery message can be missed by a timestamp-based approach. Mitigated, not solved, by a small overlap window (re-fetch the last N minutes on every incremental run and rely on `EmailRecord`'s existing duplicate detection, `lib/email/types.ts:157-158`'s `isDuplicate`/`duplicateOfId`, to no-op the re-fetched-but-already-imported messages) — this trades a small amount of redundant API quota for coverage, an explicit and intentional tradeoff given Yahoo's ceiling is unknown (§3.2) and must be re-evaluated once it is.

## 6.5 Account Aggregator — windowed FI data pulls, push-triggered

- **Cursor**: the last successfully-processed `FIDataRange.to` timestamp per linked account within a consent.
- **Trigger model is inverted relative to email providers**: AA does not support a client-initiated "check for new data" poll the way Gmail/Graph do — the AA Gateway pushes an FI Notification webhook when new data matching an active consent's `FIDataRange` is available. This plan's `sync.ts` for Account Aggregator therefore has a second entry point beyond the scheduled cron: the FI Notification webhook Route Handler (new, per `02-oauth-flow-review.md` §2.4) dispatches `ledger/sync.started` directly, with `runType: "incremental"`, the moment a notification arrives — the scheduled path still exists as a fallback safety net (in case a webhook delivery is missed) but is not the primary trigger for this one provider, unlike every other provider in this plan.
- **Resume**: identical mechanism to every other provider — `SyncJob.lastCheckpoint` stores the last-processed `FIDataRange.to`; a resumed run requests `FIDataRange.from = lastCheckpoint`.
- **Multi-account fan-out**: one consent can cover multiple linked accounts (`Consent.linkedAccounts`, `plugins/account-aggregator/types.ts`, referenced from `auth.ts:47`) — each linked account gets its own cursor within the same `SyncJob.metadata`, since accounts within one consent can have independently-arriving FI data.

## 6.6 Document OCR — not applicable

No incremental concept — confirmed in `05-provider-capability-matrix.md` §5.2. Each document is processed exactly once via `processDocument()`; a re-upload of the same file is caught by `findDuplicate()` (`plugins/document-intelligence/pipeline.ts:97`), an existing mechanism unrelated to sync cursors.

## 6.7 Partial synchronization failures and resume — the shared mechanism

Identical across every provider above, by design (this is the point of the shared `SyncJob.lastCheckpoint` contract):

1. A `sync-run` job processes a page/batch, checkpoints its position (`step.run("record-progress", ...)` writing `SyncJob.lastCheckpoint`, mirroring the existing `record-running`/`record-completed` step pattern in `lib/jobs/functions/sync.ts:71-96`, `:107-113`), and only then moves to the next page.
2. If the job fails (thrown error, provider outage, quota exhaustion) mid-batch, `lastCheckpoint` reflects the last *successfully checkpointed* page, not the in-flight one — so a resume never re-reports a partially-committed page as done, and never skips a page it didn't finish.
3. On retry (§4) or on the next scheduled run, the provider service reads `lastCheckpoint` and resumes from exactly that position — for Gmail/Outlook this is a page token or delta link continuation; for Yahoo/AA it's a timestamp window continuation.
4. `SyncJob.status = "partial"` (an existing status value, `lib/sync/types.ts:29-38`) is used when a run stops with some items imported and some remaining — distinct from `"failed"` (nothing usable happened) and `"completed"` (fully caught up) — already rendered distinctly by the existing Feed contribution (`lib/sync/engine.ts:295-305`'s `"partial"` → `severity: "warning"` branch), unchanged by this plan.

No provider gets a bespoke resume mechanism — the checkpoint contract, the `partial` status, and the retry/dead-letter path (`04-retry-strategy.md`) are the single shared design every provider's `sync.ts` implements against.
