# Account Aggregator Plugin

The first connector plugin built on both the Plugin Framework and the Bank
Connector Framework together. It validates the full connector lifecycle and
synchronization flow for a consent-based, multi-institution Account
Aggregator provider — **mock provider responses only**. No real AA network,
NBFC-AA, credential, or OAuth flow is implemented; see
[Future Compatibility](#future-compatibility) for what a real integration
would replace without touching anything else.

## Architecture

```
plugins/account-aggregator/
  types.ts          AA-specific types (Consent, AARawAccount, AARawTransaction, ...).
  mock-provider.ts   Deterministic mock AA API — institutions, account discovery,
                     transactions, provider health. No network.
  consent.ts         Independent Consent lifecycle state machine (localStorage-backed).
  auth.ts            Mock authentication flow: Request Consent -> Pending -> Granted ->
                     Account Discovery, composing consent.ts + mock-provider.ts.
  mapper.ts          AARawAccount/AARawTransaction -> lib/banks/types.ts's
                     BankAccount/RawBankTransaction (the framework's bank-agnostic shapes).
  connector.ts        BankConnector implementation; registers with lib/banks/registry.ts.
  sync.ts             Synchronization orchestration — thin wrappers over
                     lib/banks/sync-engine.ts, this plugin's only sync path.
  plugin.ts           Plugin Framework registration; Feed/Search/Coach contributions
                     not already covered generically by the Bank Connector Framework.
  __tests__/          Vitest suite covering every required mock scenario.
```

`consent.ts`, `mock-provider.ts`, and `mapper.ts` never import each other or
anything connector/plugin-specific — each is independently testable. Only
`connector.ts`, `sync.ts`, and `plugin.ts` compose the others.

## Flow

```
Mock AA provider (mock-provider.ts)
  -> auth.ts's connect(): Request Consent -> Pending -> Granted -> Account Discovery
  -> consent.ts persists the Consent state machine
  -> connector.ts's sync(): mock-provider.fetchTransactions() -> mapper.ts
       -> RawBankTransaction[] / BankAccount[] (framework-agnostic shapes)
  -> lib/banks/sync-engine.ts's runSync()   <- the ONLY sync entry point used
       -> lib/banks/mapper.ts's toIngestInput() (generic, reused unchanged)
       -> lib/ingestion/pipeline.ts's ingestTransaction()
            -> Merchant Intelligence -> AI Memory -> Classifier   (automatic)
       -> lib/storage.ts's addTransactions()
       -> lib/workflows/engine.ts's runWorkflowsForTrigger("transaction-imported", ...)
  -> Feed / Search / Coach already covered generically for this connector by
     sync-engine.ts's own contributors (registerConnector() covers it for free)
  -> plugin.ts additionally contributes Consent-specific Feed/Search/Coach content
  -> lib/intelligence/orchestrator.ts's buildFinancialState() picks all of this up
     automatically — no orchestrator-level code needed for this plugin.
```

This plugin never constructs a `Transaction`, `BankAccount`, or `SyncRun` by
hand outside `mapper.ts`'s translation step, and never bypasses
`lib/banks/sync-engine.ts` for any sync path (Initial, Incremental, Manual
Refresh, or Retry).

## Consent Model

`consent.ts` owns exactly one `Consent` record at a time (`id`, `provider`,
`status`, `purpose`, `createdAt`, `expiresAt`, `lastUpdated`,
`linkedAccounts`, `permissions`), persisted in `localStorage`, plus an
append-only timeline (`getConsentHistory()`) of every status transition.
Statuses: `Pending` -> `Granted` | `Denied`; `Granted` -> `Expired` |
`Revoked`. `expireIfNeeded(now)` is called before every sync/health check so
an expired consent is always caught deterministically rather than assumed
still valid.

## Supported capabilities (mock)

Institution Discovery, Consent Request, Consent Status, Account Discovery,
Account Metadata, Balance Sync, Transaction Sync, Refresh, Disconnect, Health
Check — all implemented against `mock-provider.ts`'s fixture data (3
institutions; Savings, Checking, Credit Card, and Wallet accounts).

## Test scenarios (`AAScenarioOptions`)

`connector.ts`'s `createAccountAggregatorConnector(options)` factory (mirrors
`lib/banks/providers.ts`'s `DemoBankB` failure-injection options) accepts:
`denyConsent`, `expireConsentImmediately`, `providerOffline`, `failSync`,
`removeAccountId` — used by `__tests__/` to exercise Consent Denied/Expired,
Provider Offline, Failed Sync, and Account Removed without touching the
production singleton `accountAggregatorConnector`.

## Plugin Framework integration

- **Registration**: `plugin.ts` exports `accountAggregatorPlugin`, added to
  `lib/plugins/loader.ts`'s built-in plugin list.
- **Connector registration**: `connector.ts` registers
  `accountAggregatorConnector` with `lib/banks/registry.ts` as a module-level
  side effect (the same pattern `lib/banks/providers.ts` uses), imported by
  `plugin.ts`, `components/BankDashboard.tsx`, and
  `components/AccountAggregatorDashboard.tsx` so it's live regardless of
  which page loads first in a session.
- **Enablement coupling**: the plugin's `initialize()`/`shutdown()` toggle
  the connector's own enabled flag (`setConnectorEnabled`), so disabling this
  plugin from `/plugins` also stops it from being synced — the two
  frameworks otherwise share no state.
- **Feed**: `sync-engine.ts`'s own generic contributor already produces "New
  account connected" / "Synchronization complete" / "Sync failed" items for
  this connector for free. `plugin.ts` additionally contributes "Consent
  granted" and "Consent expired" items, which the generic contributor
  doesn't know about.
- **Search**: `sync-engine.ts` already indexes this connector's accounts,
  institution, and sync runs (`bank-account`/`bank-institution`/
  `bank-sync-run`). `plugin.ts` additionally indexes the Consent record
  itself under a new `consent` `IndexObjectType`.
- **Coach**: `plugin.ts` registers via
  `lib/coach/contributors.ts`'s `registerCoachImportSummaryContributor` —
  structured, pre-computed facts only (linked account count, last sync's
  imported/duplicate/failed counts). The AI Financial Coach only narrates
  this; it never re-derives anything from raw consent or transaction data.
- **Workflow Engine**: fires `"consent-granted"`, `"account-connected"`,
  `"sync-completed"`, `"sync-failed"`, and `"disconnect"` (new
  `WorkflowTrigger` values added to `types/workflow.ts`) at the corresponding
  lifecycle points, alongside the existing `"transaction-imported"` trigger
  `sync-engine.ts` already fires per transaction.

## Dashboard

`/plugins/account-aggregator` (`app/plugins/account-aggregator/page.tsx`,
backed by `components/AccountAggregatorDashboard.tsx`): Consent Status,
Consent Timeline, Connected Accounts (with recent transactions), Provider
Health, Sync Status, Supported Capabilities, Manual Refresh, Retry Sync, and
Disconnect. The connector also appears on the generic `/banks` dashboard like
any other `BankConnector`, and on `/plugins` via the "Manage" link.

## Testing

`npm test` runs the Vitest suite in `__tests__/`: Consent Granted / Denied /
Expired, Initial Sync, Incremental Sync (including a conflict-detection
fixture mirroring `lib/banks/providers.ts`'s), Duplicate Transactions, Failed
Sync, Provider Offline, Account Removed, and Disconnect.

## Future Compatibility

`connector.ts` implements nothing but the published `BankConnector`
interface (`lib/banks/connector.ts`) — a real integration replaces exactly
these pieces without any change elsewhere in the app:

- `mock-provider.ts` -> a real Account Aggregator SDK/API client (or a
  different Open Banking/OAuth provider's client) implementing the same
  function signatures.
- `auth.ts` -> a real consent-approval redirect/callback flow; `consent.ts`'s
  state machine and persisted shape need no changes.
- Multiple AA providers or institution-specific adapters are additional
  `BankConnector` implementations registered the same way this one is.
- Credential rotation / background synchronization / consent renewal are
  scheduling concerns layered on top of `sync.ts`'s existing
  `runInitialSync`/`runIncrementalSync`/`manualRefresh`/`retry` calls and
  `lib/banks/scheduler.ts`'s existing due-for-sync logic — neither needs to
  change for this plugin to adopt them.

## Explicitly out of scope for this milestone

Real credentials, production authentication, backend APIs, cloud storage,
server-side synchronization, secure token storage, Investment/Loan APIs,
machine learning, and real Account Aggregator network calls.
