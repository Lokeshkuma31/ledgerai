# 5. Provider Capability Matrix

## 5.1 Matrix

| Capability | Gmail | Outlook (Graph) | Yahoo Mail | Account Aggregator | Document OCR |
|---|---|---|---|---|---|
| Auth model | OAuth2 (live, §2) | OAuth2 (live, §2) | OAuth2, identity-only until partner approval (§2.2.1) | Consent artifact, not bearer token (§2.4) | None (no account) |
| Incremental sync | **Yes** — History API (`historyId` cursor) | **Yes** — Delta Query (`@odata.deltaLink`) | **No native delta** — pagination-based only (§6) | **Partial** — `FIDataRange` windowed pulls, not a true cursor (§6) | N/A — one-shot per document |
| Pagination | `pageToken`, `messages.list` | `@odata.nextLink` | `start`/`count` offset pagination (IMAP-style or REST, per Yahoo's actual mail API once approved) | AA Gateway paginates `FI Data` push events, not a client-driven page cursor | N/A |
| Attachments | Yes — `messages.attachments.get`, base64 | Yes — `/messages/{id}/attachments` | Unknown pending partner docs | N/A (AA delivers structured statement data, not files) | **Is** the attachment-processing layer |
| Rich delta queries | History API also reports deletions (`messagesDeleted`) | Delta Query reports deletes/moves natively | No | No — AA has no delete/move concept, only new `FIDataRange` pushes | N/A |
| Push/webhook option | Yes — Gmail `watch()` + Cloud Pub/Sub (not used in this plan; polling via cron-triggered `sync-run` is sufficient for this app's sync cadence and avoids standing up a Pub/Sub subscription) | Yes — Graph webhooks (`/subscriptions`) (same decision: polling preferred for this plan) | Unknown | **Required, not optional** — FI data delivery is push-based (§2.4); this is the one provider where polling is not an option | N/A |
| Rate limit visibility | No remaining-quota header | Yes, in some deployments (`RateLimit-Remaining`-style) | Unknown | Per-AA-agreement | Vendor-specific |
| Multi-account per user | Yes (multiple Google accounts → multiple `Connection` rows) | Yes | Yes | Yes (multiple AA consents, potentially multiple FIPs per consent) | N/A |
| Batch API | Yes (`batch` endpoint, reduces request count) | Yes (`$batch`) | Unknown | N/A | Vendor-dependent |

## 5.2 How an unsupported feature is approximated — the general rule

Every gap in the matrix above is handled the same way, consistent with `01-provider-integration-architecture.md`'s "core app stays provider-agnostic" rule: **the `SyncProvider.supportsIncremental` flag (`lib/sync/types.ts:140`) is the only signal the Sync Engine and job scheduler ever consult.** A provider that lacks true incremental sync (Yahoo, until/unless its real API proves otherwise; Account Aggregator) sets `supportsIncremental: false` and instead implements a bounded, deterministic **pagination-replay** strategy inside its own `sync.ts` — never a special case inside `lib/jobs/functions/sync.ts` or `lib/sync/engine.ts`. Concretely:

- **Yahoo (no delta)**: each `sync-run` fetches messages newer than the last successfully-processed `receivedAt` timestamp (stored in `SyncJob.lastCheckpoint`, a value this framework already treats as an opaque provider-defined string/JSON per `lib/sync/types.ts:68-71`'s own doc comment). This is strictly weaker than a true cursor — a message whose `receivedAt` is backdated (rare, but possible via provider clock skew or a delayed-delivery message) can be missed. This is a **known, accepted limitation**, not a bug to fix — flagged explicitly in the Yahoo provider's own `metadata()` description so it's visible to anyone inspecting `/connections`.
- **Account Aggregator (windowed pull, push-triggered)**: `lastCheckpoint` stores the last successfully-processed `FIDataRange.to` timestamp; each new consent-driven `FIDataRange` request starts from there. Because AA delivery is push-based (§2.4), the actual trigger for a `sync-run` on this provider is the FI Notification webhook, not the cron schedule other providers use — `sync.ts` for AA dispatches `ledger/sync.started` from the webhook handler instead of (or in addition to) the scheduled path.
- **Document OCR (no sync concept at all)**: not approximated — it genuinely has no incremental/pagination axis, since it's invoked once per uploaded document via the existing synchronous `processDocument()`/`importDocument()` pipeline (`plugins/document-intelligence/pipeline.ts`), unchanged by this plan. It never registers a `SyncProvider`.

## 5.3 Attachment handling capability, by provider

| Provider | Attachment path |
|---|---|
| Gmail | `RawEmailAttachment` (`lib/email/types.ts:46-53`) populated from the Gmail API's attachment metadata + a follow-up `attachments.get` call for bytes; bytes are streamed into R2 storage (existing document-upload path, not re-implemented) and handed to Document Intelligence via the same `mockTextKey`-shaped hand-off the mock provider already demonstrates (`lib/email/types.ts:41-44`'s comment on how an email attachment reaches OCR without the Email framework parsing it itself) |
| Outlook | Same shape via Graph's `/attachments` endpoint |
| Yahoo | TBD pending partner docs |
| Account Aggregator | No file attachments — FI data arrives as structured JSON (accounts/transactions/balances per the ReBIT schema), mapped directly via `plugins/account-aggregator/mapper.ts`'s existing `toBankAccount`/`toRawBankTransaction` functions, unchanged |
| OCR | Is the attachment-processing layer for every other provider — not itself a source of attachments |

## 5.4 Capability-driven gating in Connection Hub

`ConnectionProvider.supportedCapabilities()` (`lib/connections/types.ts:198`) already exists and already returns `["identity"]` for Yahoo vs. `["identity", "email-read"]` for Google/Microsoft (`lib/connections/providers.ts:276`, `:295`, `:314`). This plan's only change here: the Connection Hub UI must read this array to decide whether to offer a "Sync Now" action at all — a connection with only `identity` capability (Yahoo, pre-approval) should show a disabled/greyed sync control with the existing metadata description as its tooltip, rather than letting a user trigger a sync-run that has nothing to fetch. This is a small, additive UI condition, not a redesign, and reuses data already computed by `getProviderDescriptors()` (`lib/connections/engine.ts:262-272`).
