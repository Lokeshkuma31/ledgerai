# 7. Error Recovery Matrix

## 7.1 Connection Hub UX states — the full set, mapped to backend conditions

The task's requested UX states (Connected, Syncing, Healthy, Warning, Quota Limited, Permission Revoked, Reconnect Required) are not seven independent states — they're drawn from **two existing, orthogonal enums** plus one additive value this plan introduces. `ConnectionStatus` (`lib/connections/types.ts:26-35`) answers "is there a live OAuth grant"; `ConnectionHealthStatus` (`:37-45`) answers "is it currently usable"; `SyncJob.status` (`prisma/schema.prisma`, `SyncJobStatus` enum) answers "is a sync running right now." The UI composes all three — it does not need a new unified enum.

| Task's UX label | Backend condition | Existing symbol |
|---|---|---|
| Connected | `ConnectionStatus = "connected"` | `lib/connections/types.ts:31` |
| Syncing | Latest `SyncJob.status = "running"` for that connection | `prisma/schema.prisma` `SyncJobStatus.RUNNING` |
| Healthy | `ConnectionHealth.status = "healthy"` | `lib/connections/health.ts:38` (`deriveHealth()`'s default branch) |
| Warning | `ConnectionHealth.status = "warning"` (token nearing expiry, `shouldRefresh()` true but not yet expired) | `health.ts:35-36` |
| Quota Limited | **New** — `ConnectionHealth.status = "quota-limited"` (§3.6's circuit breaker open state) | Net-new enum value, additive only. Unlike every other row in this table, this value is **not** produced by `deriveHealth()`'s own precedence logic (`health.ts:16-38` is a pure function of `StoredConnection.status`/`.tokens` with no visibility into `SyncJob` history) — it is written as a separate override by the circuit breaker guard and must be checked for before `deriveHealth()`'s token-based result is trusted by any caller. See `03-api-quota-strategy.md` §3.6 for the exact write/clear mechanism this requires |
| Permission Revoked | `ConnectionHealth.status = "permission-revoked"` | `health.ts:22-24`, `isRevocationError()` |
| Reconnect Required | `ConnectionStatus ∈ {"authentication-failed", "permission-revoked", "expired"}` — any state where the only recovery path is a fresh OAuth round-trip | `lib/connections/types.ts:26-35` |

`deriveHealth()`'s existing precedence order (`health.ts:16-38`) already resolves conflicts correctly: an explicit disconnected/revoked/failed status always wins over anything token-timing-derived. This plan's only change to that function is inserting the quota-limited check (from §3.6's circuit breaker) at the same precedence tier as `warning` — checked only for a connection that is otherwise `connected` with valid tokens, since quota exhaustion is a usage condition, not an auth condition.

## 7.2 Recovery matrix

Rows are failure modes named in the task brief; columns are provider families that share a recovery path (email providers behave near-identically; AA and OCR diverge structurally).

| Failure mode | Gmail / Outlook / Yahoo | Account Aggregator | OCR |
|---|---|---|---|
| **Expired token** | `token-manager.ts::isExpired()` detected proactively (300s early, §2.3) or reactively on a 401. `refreshToken()` (`lib/connections/providers.ts:67-120`) attempts silent refresh. Success → `connected`/`healthy`, audit event `connection.token_refreshed`. Failure → falls through to "revoked" below. | Consent has its own expiry (`Consent.expiresAt`, `plugins/account-aggregator/types.ts`) — `refreshSession()`'s `expireIfNeeded()` (`auth.ts:59-61`) is the AA-equivalent proactive check, but **AA consent expiry is typically not silently refreshable** (RBI spec requires re-consent, not a token refresh, for an expired consent in most AA implementations) — surfaces directly as Reconnect Required, skipping the "attempt silent refresh" step Gmail/Graph get | N/A — no auth |
| **Revoked permission** | `isRevocationError()` (`health.ts:41,49-51`) matches OAuth `invalid_grant`/`unauthorized_client` → `ConnectionStatus = "permission-revoked"`, audit event `connection.permission_revoked`, dispatch `ledger/workflow.trigger` (`connection-permission-revoked`) → Feed item "Connection expired" (existing copy, `lib/connections/engine.ts:344-346`) | AA Gateway reports `Denied`/`Revoked` consent status explicitly (no ambiguity the way OAuth's overloaded `invalid_grant` has) — maps directly to the same `permission-revoked` UI state | N/A |
| **Network error / timeout** | Classified transient (`04-retry-strategy.md` §4.2) → Inngest retries up to `RETRY_COUNTS["sync-run"]`. No user-facing message until retries exhaust — a single transient blip must never surface as a Connection Hub warning, matching the existing "don't cry wolf" posture of `lib/sync/engine.ts`'s Feed contribution (only reports "Provider Offline" after 3 consecutive job-level failures, `lib/sync/engine.ts:330-341`) | Same transient handling; AA Gateway/FIP downtime is explicitly modeled in the ReBIT error envelope (§4.3) rather than inferred from a generic timeout | Vendor-specific transient (typically 5xx/timeout) — same retry treatment via `document-parse`'s existing retry budget |
| **Provider downtime** | Same transient path; if downtime outlives the retry budget, dead-letters (§4.5) and Connection Hub shows the existing "Provider Offline" Feed item pattern, generalized from bank connectors to email | AA-specific: FIP (bank) downtime vs. AA Gateway downtime are distinguishable in the ReBIT error envelope — FIP downtime is reported as a *specific linked account's* data being unavailable, not the whole consent failing, so recovery is per-account, not per-connection | Vendor outage — dead-letters `document-parse`; user sees the document stuck in "processing" in the Upload Preview until manually retried or the vendor recovers |
| **API quota exhaustion** | Full path in `03-api-quota-strategy.md` — circuit breaker opens, `quota-limited` health, automatic half-open retry | Per-AA-agreement rate limits (§3.2) — same circuit breaker mechanism, different ceiling | Vendor rate limit — same circuit breaker mechanism, applied to `document-parse` instead of `sync-run` |
| **Malformed response** | Parse failure (unexpected JSON shape, truncated body) → classified **permanent** under the existing `ZodError`/`ValidationError` rule (§4.2) if the provider service validates responses with Zod before mapping — recommended for every new provider service, matching the codebase's existing Zod-at-the-boundary convention elsewhere. Does **not** retry (retrying an unparseable response reproduces the same failure) — dead-letters immediately, operator investigates via `JobDeadLetter.eventPayload`/`.error` | Same — AA's structured envelope is still JSON and still validated at the boundary the same way | Same — a corrupt/unparseable vendor OCR response is permanent, not retried |
| **Partial sync failure** | Full mechanism in `06-incremental-sync-design.md` §6.7 — `SyncJob.status = "partial"`, resume from `lastCheckpoint` on next run/retry | Same mechanism; per-linked-account checkpoint granularity (§6.5) means one FIP's downtime doesn't block other linked accounts within the same consent from completing | N/A — OCR has no multi-item batch within one document to partially fail (a multi-page document either extracts or it fails; page-level partial extraction, if a vendor supports it, is a vendor-specific enhancement out of scope for this plan) |

## 7.3 User-facing messaging principles

Inherited from the existing Feed/Coach conventions, not new copywriting rules invented for this plan:

- **Never blame the user for a provider-side failure.** Existing copy ("has failed its last N synchronization attempts and may be offline," `lib/sync/engine.ts:337`) already models this — recovery-matrix messaging for every new provider follows the same voice.
- **The AI Coach narrates pre-computed facts, never live provider state.** Per `lib/sync/types.ts:202-204`'s own contract comment ("the Coach only narrates these; it never triggers or decides a sync itself") and `lib/connections/README.md`'s explicit statement that the Coach "never accesses a token or calls a provider" — this is unchanged for every real provider added.
- **Reconnect Required always has exactly one action**: re-run `startConnection()` with `existingConnectionId` set (`lib/connections/engine.ts:45-51`, `:78-88`) — never a second, provider-specific reconnect path. This is already how Google/Microsoft/Yahoo reconnect works; Account Aggregator's consent-artifact-based "reconnect" (a fresh consent request, not an OAuth code exchange) must still resolve to the same UI action and the same `existingConnectionId` semantics, even though what happens underneath differs (§2.4).

## 7.4 Reconnection flow

Identical for every OAuth-based provider (Gmail/Outlook/Yahoo), unchanged from what's already implemented:

1. UI shows "Reconnect" on a connection whose `ConnectionStatus` is `authentication-failed`/`permission-revoked`/`expired`.
2. `startConnection(providerId, redirectUri)` (`lib/connections/engine.ts:45-51`) builds a fresh PKCE pair + state, same as an initial connect.
3. The Route Handler passes `?reconnect=<connectionId>` through to the callback, which calls `completeConnection()` with `existingConnectionId` set — `providers.ts`'s `connect()` (`:150-204`) then **updates the existing record in place** (preserving `connectedAt`, appending a `"reconnected"` history event) rather than creating a duplicate `Connection` row.
4. Ownership is independently re-verified against `existingConnectionId` inside `completeConnection()` (`engine.ts:78-88`) regardless of what the reconnect query param claims — closing the exact IDOR class `docs/security-hardening/03-idor-verification-report.md` documents.

For Account Aggregator, the same four steps apply with step 2/3 substituting AA's consent-request/redirect/consent-artifact sequence (§2.4) for the OAuth code exchange — the `existingConnectionId` re-verification in step 4 is unchanged and equally mandatory.
