# 9. Rollback Strategy

## 9.1 Principle: rollback is a plugin-disable operation, not a deploy revert

Because every provider is isolated behind the `Plugin` lifecycle (§1.2) and the provider-package boundary (§1.4), rolling back a failing real provider does not require a code deploy or a redeploy of the previous version — it requires `disablePlugin(id)` (`lib/plugins/lifecycle.ts:80-86`), which already exists, already runs the provider's own `shutdown()`, and already leaves every other provider untouched. This is the single most important property this rollback strategy relies on, and it is not new — it is the existing, tested guarantee `safeCall()` (§1.2) provides today for the mock providers.

## 9.2 Safe-disable procedure, per provider

| Step | What happens | Data safety guarantee |
|---|---|---|
| 1. Disable the plugin | `disablePlugin("<provider>")` — calls the provider's `shutdown()`, sets `enabled: false` | No sync jobs are queued or executed for this provider going forward; in-flight `sync-run` jobs for it are **not** force-cancelled by this step alone (see 9.3) |
| 2. Pause the Sync Engine's scheduling for it | `SyncProvider.recommendedSchedule` stops mattering once disabled — the scheduler (`lib/sync/scheduler.ts`/the Inngest cron equivalent) skips a disabled provider | No new `ledger/sync.started` events dispatch for it |
| 3. Leave `Connection` rows intact | Disabling a *plugin* is distinct from disconnecting a *connection* — the user's OAuth grant/AA consent stays valid and encrypted at rest; only the app's use of it pauses | Tokens are not wiped (wiping only happens on explicit user-initiated disconnect, `providers.ts:206-224`) — a rollback is reversible without forcing every user to reauthenticate |
| 4. Leave imported data intact | Every `EmailRecord`/`Transaction`/`SyncJob` already created by the provider before rollback is untouched — this plan introduces no provider-specific deletion on disable | Financial data already ingested is never deleted as a side effect of a rollback |

## 9.3 In-flight job handling during rollback

A `sync-run` job already executing when rollback begins is **not** interrupted mid-step by `disablePlugin()` alone (the Plugin Framework and the Job Platform are independent systems — this plan does not wire plugin-disable into Inngest's `cancelOn`). Two options, and this plan recommends the first as the default:

- **Let it finish** (recommended default): the in-flight run completes or fails on its own; because `sync-run` is idempotent and checkpointed (§6.7), letting it finish naturally is strictly safer than interrupting it mid-page. Disabling the plugin only prevents the *next* run from being scheduled.
- **Force-cancel** (only if the failure mode being rolled back from is actively harmful mid-run, e.g. writing malformed data): dispatch `ledger/connection.disconnected` for the affected connection, which `lib/jobs/functions/sync.ts`'s job would need a `cancelOn` clause added to react to (not present today — `08-worker-architecture.md` §8.5 names this as the intended mechanism for connection-driven cancellation generally, so wiring it for rollback-triggered force-cancel is an extension of an already-planned mechanism, not new architecture).

## 9.4 Reverting to the mock implementation

Because a real provider and its mock satisfy the *identical* interface (`EmailProvider`/`BankConnector`/`OCRProvider`, unchanged per §1.7), reverting to mock is a **registration swap**, not a data migration:

1. `plugins/<provider>/plugin.ts`'s module-load side effect (`registerEmailProvider(realProvider)` today; `registerEmailProvider(mockProvider)` after revert) determines which implementation the framework talks to.
2. This is gated behind an environment-level feature flag (recommended: `PROVIDER_<NAME>_MODE = "real" | "mock"`, read once at module load, mirroring the existing pattern where a provider missing its OAuth env vars already degrades to "not configured" rather than crashing, `lib/connections/README.md`'s Setup section) — **not** a database flag, since which implementation loads is a deploy-time/runtime-environment concern, not a per-user or per-organization setting.
3. Reverting to mock does **not** roll back any already-imported real data — `EmailRecord`/`SyncJob` rows created while the real provider was active remain in Postgres; the mock provider resumes generating its own fixture-based records going forward, clearly distinguishable by `providerId` (`"gmail"` real vs. a mock-specific id if the two need to coexist during a staged rollback, though in practice the mock and real Gmail implementation share the same `GMAIL_PROVIDER_ID` today per `plugins/gmail/mock-provider.ts:13`, which is fine for a full revert but means a *partial* population (some users on real, some on mock) is not supported by the current id scheme without a small extension — flagged here, not solved, since partial-population rollback is not a stated requirement).

## 9.5 Handling partially-synchronized data during rollback

This is the one area where rollback intersects with data correctness, not just availability:

- **A `partial`-status `SyncJob` at the moment of rollback is left as `partial`**, not force-completed or force-failed. Its `lastCheckpoint` remains valid — if the provider is later re-enabled (rollback reversed, or the underlying issue fixed and a re-launch attempted), the next `sync-run` resumes exactly where it left off (§6.7's checkpoint contract does not distinguish "resumed after a transient retry" from "resumed after a rollback-and-re-enable" — both are just "resume from `lastCheckpoint`").
- **Data already imported from a partial run is not retroactively invalidated.** If a rollback is triggered because a provider was returning *some* malformed records mixed with valid ones (rather than failing outright), already-imported valid `Transaction` rows stay — this plan does not build an automatic "undo the last N imports" mechanism, because determining which imports were corrupted by the rollback-triggering bug versus genuinely valid requires human judgment the system cannot safely automate. The operational path is: disable the plugin (9.2), inspect the affected `SyncJob`/`EmailRecord`/`Transaction` rows via the existing audit trail (`AuditLog`, `SyncHistoryEvent`), and manually correct/delete specific records through existing data-management tooling if the investigation confirms corruption — this is explicitly an operator decision, not an automated rollback step.
- **No cross-provider blast radius.** Because `SyncJob.providerId`/`.connectionId` scope every row, a Gmail rollback cannot touch Outlook or Account Aggregator data even though they share the same `SyncJob` table — verified by the existing per-provider filtering already used throughout `services/sync/sync-job-service.ts` and `lib/sync/history.ts`.

## 9.6 Rollback decision authority and communication

Not an engineering-only decision once a provider is live with real user data: rolling back Gmail after it has been serving real users means those users' next sync attempt (until the provider is re-enabled or reverted to mock) simply doesn't happen — silently, from their perspective, unless the Connection Hub UX is updated to reflect it. **This plan requires that a plugin-level rollback also update `ConnectionHealth` for every affected connection** (a new `disabled`-by-operator message, distinct from any user-facing health state in §7.1's table, reusing the existing `ConnectionHealth.message` free-text field rather than adding a new enum value for what is meant to be a rare, operator-initiated, temporary state) — so a user opening `/connections` during a rollback sees an accurate "temporarily paused" message rather than a silently stale "healthy" status left over from before the rollback.
