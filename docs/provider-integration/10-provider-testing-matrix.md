# 10. Provider Testing Matrix

## 10.1 Existing test conventions this plan inherits, not reinvents

Every mock provider already ships a Vitest suite following the same shape (`plugins/gmail/` has none yet directly, but `lib/email/__tests__/{engine,classifier,matcher}.test.ts` cover the framework against the mock; `plugins/account-aggregator/__tests__/{connector,consent}.test.ts` and `plugins/document-intelligence/__tests__/{classifier,pipeline,validation}.test.ts` cover their respective domains directly). `lib/connections/__tests__/{engine,health,oauth,token-manager}.test.ts` already demonstrates the exact pattern real-provider OAuth tests extend: **mocked `fetch()` returning the real shape each provider's actual token/userinfo endpoint returns**, not a fake in-process stub — per `lib/connections/README.md`'s Testing section, this is how Google/Microsoft/Yahoo success flows, token refresh, revoked-permission detection, authentication failure, reconnect, and disconnect are already covered for the OAuth layer today. This plan's testing requirements are additive to that, covering the fetch/sync layer OAuth testing doesn't reach.

## 10.2 OAuth / consent flow coverage (per provider)

| Scenario | Gmail / Outlook / Yahoo | Account Aggregator |
|---|---|---|
| Successful connect | **Already covered** (`lib/connections/__tests__/engine.test.ts`) — no new test needed | New — consent request → redirect → artifact receipt, mocked against the AA Gateway's documented response shape |
| Successful reconnect | **Already covered** | New — re-consent flow, verifying `existingConnectionId` is preserved and ownership re-verified (§7.4) |
| Token/consent refresh | **Already covered** | New — consent revalidation (`expireIfNeeded()`-equivalent against a real Gateway response) |
| Revoked permission detection | **Already covered** (`isRevocationError()` unit test) | New — AA's explicit `Denied`/`Revoked` consent-status field, simpler to assert than OAuth's overloaded `invalid_grant` |
| Authentication failure | **Already covered** | New |
| Disconnect (+ token/consent wipe verification) | **Already covered** | New — must verify the nested-encryption consent handle (§2.4) is wiped, not just marked inactive |
| Yahoo-specific: identity-only capability gating | New — verify `supportedCapabilities()` correctly excludes `email-read` until partner approval is reflected in config (§5.4) | N/A |

## 10.3 Incremental sync coverage (per provider)

| Scenario | Requirement |
|---|---|
| Initial sync, small mailbox/account (< 1 page) | Every provider — verifies the base fetch → classify → extract → ingest pipeline end to end against real API response shapes (not fixture text), reusing the existing classifier/extractor test assertions from `lib/email/__tests__/` against real-shaped input |
| Initial sync, large mailbox/account (multi-page) | Gmail (`pageToken` continuation), Outlook (`@odata.nextLink` continuation), Yahoo (offset pagination), AA (multi-linked-account fan-out) — verifies pagination logic and that `historyId`/`deltaLink`/timestamp cursor is correctly captured only after the *full* initial listing completes, not after the first page |
| Incremental sync, no new data | All — verifies a `history.list`/delta query/timestamp-filtered call with zero results is treated as a successful `SyncJob` with `itemsImported: 0`, not an error (per `lib/email/provider.ts:26-28`'s existing contract: "no new mail is a successful fetch with zero results, not a failure") |
| Incremental sync, mixed new + duplicate | All — verifies duplicate detection (`EmailRecord.isDuplicate`/`duplicateOfId`) correctly no-ops a re-delivered message without creating a second `Transaction` |
| Attachments (large mailbox, size variety) | Gmail, Outlook — verifies attachment bytes stream correctly into R2 and hand off to Document Intelligence via the existing `mockTextKey`-equivalent real-data path, including a large-attachment (near or above any provider-side size cap) and a zero-byte/corrupt-attachment case |
| Cursor expiry recovery | Gmail (`historyId` expired → 404 → fresh full listing, §6.2), Outlook (`deltaLink` invalid → 410 → fresh delta, §6.3) — must assert the fallback is treated as a new `initial`-type `SyncJob`, not a failure |
| Mid-run interruption + resume | All — force a cancellation/crash after N of M pages processed, verify `lastCheckpoint` reflects only the completed pages, and that a subsequent run resumes without re-processing or skipping |
| Rate limit hit mid-sync | All — force a 429/quota-exceeded response partway through a multi-page run, verify the job retries per `04-retry-strategy.md` and, on eventual success, produces a `completed` `SyncJob` with correct cumulative counts across the retried attempts (not double-counted from the pre-retry partial progress) |
| Permission revoked mid-sync | All — force a 401/`invalid_grant`/consent-denied response partway through, verify the job classifies permanent, does not retry, and the connection's health transitions to `permission-revoked` (not left stale as `healthy` from before the run started) |
| Provider downtime (5xx storm) | All — verifies retry-then-dead-letter path and that the circuit breaker (§3.6) opens after the configured consecutive-failure threshold, halting further attempts rather than exhausting retries repeatedly on every scheduled run |
| Partial import (some records fail validation) | All — verifies `SyncJob.status = "partial"`, valid records are still imported, invalid ones are recorded with their validation errors (not silently dropped), matching the existing `EmailRecord.validationErrors`/`EmailRecordStatus = "rejected"` pattern |

## 10.4 Provider-specific tests beyond the shared matrix

| Provider | Additional required coverage |
|---|---|
| Gmail | Quota-exceeded (403 `quotaExceeded`) vs. permission-revoked (403 `insufficientPermissions`) misclassification regression test — this is the exact bug §4.3 identifies; a dedicated test asserting these two produce *different* `classifyError()` outcomes is the regression guard against the generic HTTP-403-is-permanent rule silently swallowing it again |
| Outlook | Native delete/move handling via delta response `@removed` entries (§6.3) — no Gmail equivalent, must be tested independently |
| Yahoo | Blocked until partner API access exists (§8.1) — test suite structure should be written against the documented (not yet implemented) API shape so it's ready to run the moment partner approval lands, per the same practice already used for the mock (`plugins/gmail/mock-provider.ts`'s fixtures were written from the spec before any real integration existed) |
| Account Aggregator | FI Notification webhook signature/authenticity verification (a new attack surface — an unauthenticated webhook endpoint accepting "new financial data available" claims is a spoofing risk if not verified against the AA Gateway's signing mechanism); ECDH decryption round-trip test (§2.4); per-linked-account partial failure within one consent (§6.5) |
| OCR | Vendor-specific — malformed/corrupt file handling (matches the existing mock's "blank fixture models... a blank page, a corrupt scan" pattern, `plugins/document-intelligence/ocr.ts:34-36`, but against real corrupt files); multi-page PDF page-count accuracy; low-confidence extraction handling (the mock's `confidence: 0.97` fixed value must become a real, variable confidence score, and `validation.ts`'s existing confidence-threshold logic must be re-verified against realistic (non-1.0, non-0.97-fixed) confidence distributions) |

## 10.5 Load and scale testing

Not unit-test scope — a separate, explicit pass per provider before the `08-production-rollout-plan.md` §8.2 gate is satisfied:

- Concurrency: verify the `mutex()`-enforced one-sync-per-`(org, provider)` limit actually prevents two overlapping runs from corrupting `lastCheckpoint` under real (not simulated) provider latency.
- Multi-tenant fairness: verify `orgConcurrency`/`globalConcurrency` limits (`docs/job-platform/04-queue-strategy.md` §4.2) hold under a simulated multi-organization load where one organization's mailbox is disproportionately large.
- Throttle correctness: verify the `throttle()`/Upstash `jobProviderRateLimit` combination (§3.1) actually keeps outbound call rate under the provider's documented ceiling during a large initial sync, not just that it exists in config.

## 10.6 What is explicitly not required before go-live

- Exhaustive coverage of every possible email/document content variation — the existing classifier/extractor test suites already cover this at the framework level against mock data; this plan's testing requirement is specifically about the *provider fetch/auth/sync* layer being correct, not re-testing classification logic real data doesn't stress differently than fixtures already do.
- Yahoo's full matrix (10.2/10.3 Yahoo rows) cannot be executed before partner approval — tracked as a rollout blocker (`08-production-rollout-plan.md` §8.5), not a testing gap to route around with mocks-in-production.
