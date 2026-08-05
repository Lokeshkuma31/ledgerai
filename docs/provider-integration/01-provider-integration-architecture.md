# 1. Provider Integration Architecture

## 1.1 Ground truth: what "the Plugin Framework" actually is today

There is no single `Provider` interface in this codebase. There are **four independent, already-shipped contracts**, each owned by the framework that consumes it, plus a generic lifecycle wrapper that sits above all of them:

| Contract | File | Owns | Real today? |
|---|---|---|---|
| `Plugin` | `types/plugin.ts` | install/enable/disable/health lifecycle, capability declaration | Yes (lifecycle only — see 1.2) |
| `ConnectionProvider` | `lib/connections/types.ts` | OAuth identity + token custody (Google/Microsoft/Yahoo) | **Yes — fully real** |
| `EmailProvider` | `lib/email/provider.ts` | mailbox message fetch | No — mock fixtures only |
| `BankConnector` | `lib/banks/connector.ts` | bank/AA account + transaction fetch | No — mock fixtures only |
| `OCRProvider` | `plugins/document-intelligence/ocr.ts` | document text extraction | No — mock fixtures only |
| `SyncProvider` | `lib/sync/types.ts` | scheduling/queueing/cursor bookkeeping across all of the above | Structurally real, but only `email`/`bank` categories have a live `sync-run` Inngest job (`lib/jobs/functions/sync.ts`), and that job's actual provider call is a **marked, deferred stub** (`lib/jobs/functions/sync.ts:98-103`) |

This design does not collapse these into one interface. The task's requested "standard interface" (Connect, Disconnect, Validate, Refresh, Sync, Health, Capabilities, Metadata, Status, Version) is not a gap to fill with a new abstraction — it is the **union** of the four contracts above, which already divide those ten verbs correctly along their real seams (OAuth custody is not the same concern as message pagination, and forcing them into one interface would make the Account Aggregator's non-OAuth consent handshake and Gmail's OAuth handshake pretend to be the same shape when they aren't). Section 1.3 gives the exact mapping.

## 1.2 The Plugin Framework's real job: lifecycle, not transport

`lib/plugins/{registry,lifecycle,hooks,loader}.ts` (re-exported from `lib/plugins/engine.ts`) is the **one** framework every provider package registers with, regardless of category. It does exactly four things, and nothing about replacing mocks changes any of them:

1. **Install/enable/disable/uninstall** (`lifecycle.ts`) — every method call funnels through `safeCall()` (`lib/plugins/lifecycle.ts:17-33`), which catches a thrown error from any lifecycle method and records it as that plugin's health rather than letting one provider's failure propagate. This guarantee is exactly why a provider swap is safe: a Gmail API outage during `initialize()` degrades to a "warning" health record, it does not crash plugin install for Outlook, Yahoo, OCR, or AA.
2. **Dependency gating** (`getUnmetDependencies`, `lib/plugins/registry.ts:92-94`) — a provider that depends on another (none do today) stays registered-but-inert until its dependency is enabled.
3. **Health aggregation** (`checkPluginHealth`) — always calls the plugin's own `health()`; the framework never guesses on a provider's behalf.
4. **Version gating** (`checkPluginVersion`) — local semver comparison only, no registry lookup.

**Known gap, unrelated to provider replacement, that must be fixed in the same pass — and larger than a single file**: `lib/plugins/registry.ts:14-29` persists enabled/health/timestamp state to `window.localStorage`. This is a client-only store and cannot be the source of truth once real providers write server-side connection/sync state to Postgres (`Connection`, `SyncJob`, `JobRun`). Verified during review: the identical `typeof window === "undefined"` / `window.localStorage` pattern is not unique to the Plugin Framework's registry — it is also how `lib/email/registry.ts`, `lib/banks/registry.ts`, `plugins/document-intelligence/registry.ts`, `plugins/account-aggregator/consent.ts`, and `lib/sync/scheduler.ts` persist provider state, health, consent status, and schedule frequency today. All six no-op (writes silently discarded, reads silently return a fallback) when called server-side rather than throwing — meaning if `lib/email/engine.ts`'s existing classification/duplicate-detection pipeline is reused unchanged inside a real Inngest `sync-run` job (as §1.3 instructs), any state it reads or writes through `lib/email/registry.ts` today would silently vanish, not error, because the job executes server-side.

**This is a materially larger prerequisite than "migrate one registry"**: every one of these six modules needs a Postgres-backed store (or an explicit decision that some of them — e.g. `lib/sync/scheduler.ts`'s user-set frequency override — get folded into `Connection`/`SyncJob` metadata rather than getting their own new table) before Gmail goes live, not just `lib/plugins/registry.ts`. This is called out once here; it is a prerequisite for §8 (Rollout Plan), not a per-provider task, and §8 must gate stage 1 (Gmail) on all six, not one.

## 1.3 The provider package convention

Every provider — Gmail, Outlook, Yahoo, Account Aggregator, Document OCR — ships as one directory under `plugins/<provider>/`, composed of up to three layers depending on what that provider actually needs. **No layer is invented that the provider doesn't need** (OCR has no OAuth layer; document upload has no sync-cursor layer).

```
plugins/<provider>/
  auth.ts        [email/bank only] — registers a ConnectionProvider (OAuth) or, for AA,
                  a consent-handshake equivalent (§2.4). For Gmail/Outlook/Yahoo this is
                  NOT new code — lib/connections/providers.ts's googleProvider/
                  microsoftProvider/yahooProvider already exist, are already real, and
                  are reused unchanged. This layer's only job is decrypting a token via
                  lib/connections/token-manager.ts::decryptToken() for the fetch layer below.
  provider.ts     Implements EmailProvider | BankConnector | OCRProvider — the fetch-layer
                  contract each existing framework (lib/email, lib/banks, document-
                  intelligence) already defines and already tests against a mock. This is
                  the ONLY file that changes: swap plugins/gmail/mock-provider.ts's fixture
                  reads for real Gmail API calls behind the exact same method signatures.
  sync.ts         [email/bank only] Registers a SyncProvider (lib/sync/registry.ts) that
                  bridges provider.ts's fetch calls into the cursor/checkpoint contract
                  lib/jobs/functions/sync.ts's sync-run job drives.
  plugin.ts       Registers the Plugin (lifecycle) wrapper — install/enable/disable/health
                  — matching plugins/gmail/plugin.ts's existing shape exactly.
```

Mapping the task's ten verbs onto this package, per layer:

| Verb | Lives on | Existing symbol |
|---|---|---|
| Connect | `ConnectionProvider.connect()` (auth.ts, reused) | `lib/connections/providers.ts` |
| Disconnect | `ConnectionProvider.disconnect()` + `EmailProvider.disconnect()`/`BankConnector.disconnect()` | both — OAuth revocation and provider-session teardown are distinct concerns already split this way |
| Validate | `ConnectionProvider.validateConnection()` | `lib/connections/providers.ts:122-132` |
| Refresh | `ConnectionProvider.refreshToken()` | `lib/connections/providers.ts:67-120` |
| Sync | `SyncProvider.sync()` → delegates to `EmailProvider.fetchEmails()` / `BankConnector.sync()` | `lib/sync/types.ts:143` |
| Health | Each layer has its own `health()` — `Plugin.health()` aggregates them (§1.2) | all four contracts |
| Capabilities | `Plugin.capabilities()` + `ConnectionProvider.supportedCapabilities()` | `types/plugin.ts`, `lib/connections/types.ts` |
| Metadata | `metadata()` on every contract | all four |
| Status | `EmailProvider.status()` / `BankConnector.status()` / `ConnectionRecord.status` | `lib/email/types.ts`, `lib/connections/types.ts` |
| Version | `Plugin.version` / `ConnectionProvider.version` | both — a provider package can version its fetch logic independently of its OAuth client |

## 1.4 Where the abstraction boundary actually is

The core application (services, repositories, engines, UI) is unaware of provider-specific logic **today**, and this design keeps that invariant:

- `lib/email/engine.ts` and `lib/email/registry.ts` only ever call the `EmailProvider` interface — they do not import `plugins/gmail/*` directly (confirmed: `plugins/gmail/plugin.ts` is the only file that imports the mock fixtures and self-registers via `registerEmailProvider()` as a module-load side effect, `plugins/gmail/plugin.ts:9,92`).
- `lib/banks/sync-engine.ts` and the bank registry only ever call `BankConnector`.
- `lib/sync/engine.ts` only ever calls `SyncProvider` — the provider-agnostic guarantee itself is stated in `lib/sync/types.ts:8-9` ("The engine is provider-agnostic: it knows the SyncProvider contract below and nothing about Gmail, a specific bank, SMS parsing, or OCR"), which `lib/sync/engine.ts:1-17`'s own header corroborates from the composing side ("wires together the independent registry/queue/executor/scheduler/history/health/conflict modules... this engine never re-implements [a provider's fetch/parse logic], it only schedules, queues, retries, and records the outcome").
- `lib/jobs/functions/sync.ts`'s `sync-run` job only knows `organizationId`/`providerId`/`providerCategory`/`connectionId` — it has no Gmail-specific or Graph-specific branch, and must not gain one. Provider-specific pagination/error-shape logic belongs entirely inside `services/email/email-import-service.ts` or the equivalent bank service — never inside the job function itself. **Correction to an earlier draft of this document**: `services/email/email-import-service.ts` is not "not yet implemented" — it exists today (352 lines, fully implemented: provider registration, `EmailRecord` persistence, duplicate detection, `SyncJob` translation, organization-scoped, Postgres-backed via `repositories/email-repository.ts`, with its own passing test suite). What's actually deferred, per `lib/jobs/functions/sync.ts`'s own header comment, is narrower: the `sync-run` job doesn't yet *call into* this service's per-message recording function. Implementers should expect to preserve this service's existing duplicate-detection/translation behavior while adding the quota/error-mapping logic `03-api-quota-strategy.md` and `04-retry-strategy.md` assign to it — not to build it from scratch.
- `lib/connections/engine.ts` only calls `ConnectionProvider` — it has no per-provider branch anywhere in its ~415 lines.

**Rule for implementation**: a code review that finds `if (provider === "gmail")` or a Gmail-specific type import anywhere outside `plugins/gmail/` is a design violation, full stop. This is not aspirational — it is the existing, tested convention every mock provider already follows, and real providers inherit it unchanged.

## 1.5 What changes vs. what doesn't, per provider

| Provider | OAuth layer (`auth.ts`) | Fetch layer (`provider.ts`) | Sync bridge (`sync.ts`) |
|---|---|---|---|
| Gmail | **No change** — `googleProvider` in `lib/connections/providers.ts` is live | Replace `plugins/gmail/mock-provider.ts` fixture reads with Gmail API `users.messages.list`/`.get` calls, auth'd via `decryptToken(connection.tokens.accessToken)` | **Replace, not add** — `lib/email/syncAdapter.ts` already registers a legacy, client-triggerable `SyncProvider` for email today (§1.6); this must be repointed to dispatch through Inngest, not left in place alongside a new Inngest-only bridge |
| Outlook | **No change** — `microsoftProvider` is live | New `plugins/outlook/provider.ts` implementing `EmailProvider` against Microsoft Graph `/me/mailFolders/inbox/messages` + delta query | Same repoint as Gmail — `lib/email/syncAdapter.ts` is shared across email providers, not per-provider |
| Yahoo | **No change** — `yahooProvider` is live, but note: `capabilities: ["identity"]` only (`lib/connections/providers.ts:314`) — Yahoo Mail API access requires separate partner approval not yet obtained (§5, §8) | New `plugins/yahoo/provider.ts`, blocked until partner approval lands | New, blocked |
| Account Aggregator | **New** — no `Connection` row exists for AA today (`SyncJob.providerId`'s own schema comment: "not every provider is Connection Hub-backed... bank/SMS/document providers are separate plugin registrations with no Connection row today," `prisma/schema.prisma:343-347`). Real Sahamati/ReBIT AA integration needs its own consent-handshake module — see §2.4 | Replace `plugins/account-aggregator/mock-provider.ts` with a real FIU client against a licensed AA (Setu/Finvu/OneMoney/CAMS) | New |
| Document OCR | N/A (no OAuth) | Replace `plugins/document-intelligence/ocr.ts`'s `MockOCRProvider` with a real `OCRProvider` implementation (§5) — this is the smallest change in the whole plan: one class, one method (`extractText`), same `RawDocumentFile` → `OCRResult` signature | N/A — OCR is invoked synchronously from the upload pipeline (`plugins/document-intelligence/pipeline.ts::processDocument`), not from the Sync Engine |

## 1.6 Inngest is the only execution path — no exceptions, and this requires retiring a live legacy path first

Every provider's `Sync` verb must execute exclusively as an Inngest function. This is the correct target state and is not a new rule this plan introduces for the `lib/jobs/functions/sync.ts` path itself (`syncStart`/`syncRun`, triggered by `ledger/connection.created` → `ledger/sync.started`). **However, this rule is already violated by a second, live sync path that an earlier draft of this document failed to account for**, and closing it is a hard prerequisite — not a nice-to-have — before any real provider ships:

`components/SyncDashboard.tsx` is a `"use client"` component (line 1) that directly imports `lib/sync/engine.ts` (a module with no `"use server"` boundary) and calls its `startSync()`/`runScheduledSyncs()`/etc. exports client-side (`components/SyncDashboard.tsx:23-35`). It also side-effect-imports `lib/email/syncAdapter.ts` and `lib/banks/syncAdapter.ts` (`:10-11`), which register `SyncProvider`s whose `sync()` implementations call straight through to `EmailProvider.fetchEmails()` / `BankConnector.sync()` — i.e., the exact fetch-layer methods this plan replaces with real Gmail/Graph/Yahoo/AA calls. Put together: **the moment a real `EmailProvider` is dropped into `plugins/gmail/provider.ts` per §1.3's instruction, this legacy browser-triggered path would attempt to call it directly from the client**, which cannot work — `lib/connections/token-manager.ts::decryptToken()` is explicitly server-only (importing `node:crypto` from a `"use client"` file is a Next.js build error by construction) — and even if a provider's fetch layer avoided `decryptToken()` entirely, running real third-party API calls from the browser would bypass every guarantee (mutex concurrency, retry classification, circuit breaker, dead-letter routing) the rest of this document set assumes is the only way a provider is ever invoked.

**Required fix, sequenced as a stage-1 (Gmail) prerequisite alongside §1.2's persistence migration**: `components/SyncDashboard.tsx` and its adapter imports (`lib/email/syncAdapter.ts`, `lib/banks/syncAdapter.ts`, and by the same logic `plugins/android-sms/syncAdapter.ts` even though SMS is out of this plan's scope) must be repointed to `dispatch()` a sync-start event and poll `SyncJob` state via a Server Action/Route Handler, the same way the real Inngest path already works — or, at minimum, gated so a real `EmailProvider`/`BankConnector` registration refuses to also register a legacy client-side `SyncProvider` for the same provider ID. This is not optional cleanup: shipping Gmail without this fix means two uncoordinated code paths can call the real Gmail API for the same connection, one respecting the queue/retry/circuit-breaker design in this document set and one bypassing all of it entirely. `08-production-rollout-plan.md`'s stage-1 gate is updated (§8.5) to include this explicitly.

No provider package may call a Gmail/Graph/Yahoo/AA API from a Route Handler, Server Action, or (per the above) a Client Component — the only server-side entry points outside Inngest that may touch a provider at all are `lib/connections/engine.ts` (OAuth start/complete/disconnect/refresh, request-path-safe because they only touch the token layer, not the data-fetch layer) and `dispatch()` (`lib/jobs/dispatcher.ts`) to enqueue a sync. This mirrors `docs/job-platform/01-architecture-diagram.md`'s existing architecture, once the legacy path above is retired.

The Sync Engine's concurrency/idempotency guarantees (§4.2, §4.6 of `docs/job-platform/04-queue-strategy.md`) — one `sync-run` per `organizationId:providerId` via `mutex()`, a `check-in-flight` step backstop, `SyncJob.lastCheckpoint` for resume — apply identically to every real provider added under this plan. No provider gets a bespoke queue.

## 1.7 Non-goals (explicit)

- No change to `lib/plugins/{engine,lifecycle,hooks,loader}.ts`'s public API — only its persistence backend (§1.2's localStorage gap).
- No change to `EmailProvider`, `BankConnector`, `SyncProvider`, or `ConnectionProvider`'s method signatures — every real implementation satisfies the interface that already exists and is already tested against a mock.
- No UI redesign — Connection Hub, `/connections`, `DataSourceStatusStrip.tsx`, and `ConnectionsSettingsCard.tsx` read the same `ConnectionRecord`/`PluginRecord`/`SyncJob` shapes; new health states (§7, Connection Hub UX) are additive enum values, not new components.
- No new background-job framework — Inngest, already wired (`docs/job-platform/*`), is reused as-is.
