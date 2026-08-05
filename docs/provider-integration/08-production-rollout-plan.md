# 8. Production Rollout Plan

## 8.1 Order and rationale

Gmail → Outlook → Yahoo → Document OCR → Account Aggregator, per the task brief. This order is also, independently, the order of *increasing architectural novelty* found across §1–§7, which is the right sequencing principle: ship the provider that reuses the most already-real infrastructure first, and save the providers that require genuinely new subsystems for when the pattern (provider package convention, quota/retry/recovery plumbing, Connection Hub UX states) is already proven in production.

| Order | Provider | New infrastructure required | Reuses |
|---|---|---|---|
| 1 | Gmail | New `EmailProvider` implementation only | OAuth (100% live already), Sync Engine, Inngest `sync-run`, retry/dead-letter, Connection Hub UX |
| 2 | Outlook | New `EmailProvider` implementation + Delta Query cursor logic | Same as Gmail — OAuth already live for `microsoft` |
| 3 | Yahoo | New `EmailProvider` implementation, **blocked on external partner approval** (§2.2.1) | Same, but capability-gated (§5.4) until approval |
| 4 | Document OCR | New `OCRProvider` implementation, vendor selection | Existing synchronous upload pipeline, `document-parse` job/retry config |
| 5 | Account Aggregator | New consent-handshake module, new webhook Route Handler, extended `Connection` schema (§2.4) | Sync Engine, Inngest, retry/dead-letter, Connection Hub UX (once schema extended) |

**Why OCR before Account Aggregator, despite OCR being a smaller code change**: AA is the only provider requiring a new inbound webhook surface, new schema, and a materially different crypto model (§2.4). Shipping OCR third validates the non-email provider path (a provider with no OAuth layer at all) at lower risk before committing to AA's larger surface area. This also gives the Plugin Framework's localStorage-to-Postgres migration (§1.2's flagged gap) two full provider ships (Gmail, Outlook) to prove itself before OCR and AA both depend on it being correct.

## 8.2 Production-readiness gate — applied identically at every stage

A provider does not advance to "production" (real users' data flowing through it, not just internal/staging testing) until every row below is satisfied. This gate is deliberately the same for all five providers — a lighter gate for a "smaller" provider is how partial-quality integrations accumulate.

| Gate | Requirement | Verified by |
|---|---|---|
| Functional parity | Every method on the provider's contract (`EmailProvider`/`BankConnector`/`OCRProvider`) is implemented against the real API, not a stub returning fixture data | `10-provider-testing-matrix.md`'s full suite passing against the real provider (sandbox/test account, not mocks) |
| OAuth/consent flow | Connect, disconnect, refresh, reconnect, revocation-detection all exercised against the real provider's actual endpoints | `02-oauth-flow-review.md` §2.6, `10-provider-testing-matrix.md` §10.2 |
| Retry classification | Provider-specific error-body mapping (§4.3) implemented and verified to correctly distinguish quota-exceeded from permission-revoked | A synthetic test forcing both conditions against the real API (rate-limit test account or documented test-only quota-exhaustion endpoint where the provider offers one; otherwise a controlled low-quota test project) |
| Incremental sync | Cursor/checkpoint logic (§6) verified against a mailbox/consent with >1 page of data, including a forced mid-run interruption and resume | `10-provider-testing-matrix.md` §10.3 |
| Circuit breaker | Verified to open after the configured consecutive-failure threshold and correctly half-open/close on recovery | Load-test harness forcing repeated failures against a sandboxed endpoint |
| Observability | All metrics/spans/logs named in `02`–`04`'s Observability sections are emitting and visible in the existing `/admin/observability` dashboard | Manual dashboard check during staged rollout |
| Security sign-off | No provider-specific code outside `plugins/<provider>/` (§1.4's rule, verified by code review); privacy-review compliance (`docs/observability/08-privacy-review.md`) confirmed for every new log/span/event call site this provider adds | Code review checklist item, already existing per `08-privacy-review.md`'s own enforcement section |
| Performance benchmark | Sync of a representative mailbox/account (defined per provider below) completes within the SLA the Sync Engine's existing scheduling assumes (`SyncScheduleFrequency` options top out at `15min` — a sync must comfortably fit within that cadence for an incremental run) | Staged rollout with real-scale test accounts |
| Rollback rehearsed | The provider's specific rollback procedure (§9) has been executed at least once in staging, not just documented | Rollback dry-run sign-off |

## 8.3 Performance benchmark targets, per provider

| Provider | Representative test scale | Target |
|---|---|---|
| Gmail | Mailbox with 5,000 messages, 500 with attachments | Initial sync completes in staged batches within the job's execution window (Inngest step-based execution has no hard wall-clock ceiling the way a single serverless request would, but each `step.run()` should complete well under typical function timeout); incremental sync (post-`historyId`) for a mailbox receiving ~50 new messages/day completes in well under a minute |
| Outlook | Same scale, using Graph delta query | Same targets — Delta Query's native change-list should make Outlook's incremental sync at least as fast as Gmail's History API equivalent |
| Yahoo | Same scale — but see 8.1's blocker; benchmark cannot be executed until partner approval lands | TBD |
| OCR | Batch of 100 documents (mixed PDF/image), representative of `plugins/document-intelligence/mock-documents.ts`'s existing fixture variety | Per-document extraction latency comparable to or better than the mock's near-instant response is not the bar (mocks are unrealistically fast) — the real bar is staying within `document-parse`'s existing retry/concurrency budget (`docs/job-platform/04-queue-strategy.md` §4.2: 3 per-org / 15 global concurrency) without backing up the queue under normal upload volume |
| Account Aggregator | Consent covering 5 linked accounts, 12 months of transaction history per account | Initial `FIDataRange` pull completes within the AA Gateway's own typical SLA (provider-dependent, obtain from the chosen AA's integration docs); incremental (webhook-triggered) sync processes a single FI Notification within seconds, not minutes, since it's a bounded push payload rather than a full re-list |

## 8.4 Feature parity requirements before advancing

"Feature parity" here means parity with the *mock* provider's demonstrated behavior, not parity with every possible provider capability — the mock fixtures (`plugins/gmail/mock-provider.ts`'s 17 email scenarios covering receipts, invoices, statements, refunds, subscriptions, unknown/malformed/empty cases) already enumerate the exact scenarios a real provider must handle correctly before shipping. A real Gmail integration is not "done" until every one of those 17 scenario *categories* (not the literal fixture data) has a corresponding real-world test case passing through the real classifier/extractor pipeline unchanged — this is the existing `lib/email/classifier.ts`/`lib/email/pipeline.ts` machinery, untouched by this plan, whose correctness this rollout gate is actually verifying end-to-end for the first time against real data shapes.

## 8.5 Explicit go/no-go blockers to flag now, before any implementation work starts

1. **Yahoo Mail API partner approval** — external dependency, unknown lead time, must be initiated immediately if Yahoo's position in the rollout order is to hold (§2.2.1).
2. **Account Aggregator vendor selection** — which AA (Setu/Finvu/OneMoney/CAMS Finserv) to integrate against is a business decision this document does not make; §2.4's design is written to be AA-vendor-agnostic at the `ConnectionProvider`-equivalent layer, but the actual Gateway API client is vendor-specific and cannot be built until one is chosen.
3. **OCR vendor selection** — same category of blocker, lower stakes (no partner approval process typically required, more of a build-vs-buy/cost decision).
4. **`window.localStorage`-backed persistence migration, all six modules** (`01` §1.2: `lib/plugins/registry.ts`, `lib/email/registry.ts`, `lib/banks/registry.ts`, `plugins/document-intelligence/registry.ts`, `plugins/account-aggregator/consent.ts`, `lib/sync/scheduler.ts`) — must land before Gmail ships, not concurrently with it; sequencing it as a zero-th step of stage 1 rather than its own stage keeps the rollout order in §8.1 accurate. Widened from a single-module migration after independent review found five additional instances of the same pattern.
5. **Retire or gate the legacy client-triggered sync path** (`01` §1.6: `components/SyncDashboard.tsx` + `lib/email/syncAdapter.ts`/`lib/banks/syncAdapter.ts`) — a second stage-1 prerequisite surfaced by the same review: this path calls a provider's fetch layer directly from the browser today, which cannot coexist with a real Gmail integration (`decryptToken()` is server-only, and this path bypasses every queue/retry/circuit-breaker guarantee this plan otherwise assumes is the only way a provider is invoked). Gate 8.2's "functional parity" row now includes verifying this path no longer exists (or can no longer reach a real provider) as part of Gmail's sign-off.
