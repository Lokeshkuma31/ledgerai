# Android SMS & Notification Source Plugin

The first real plugin built on LedgerAI's Plugin & Extension Framework. It
ingests transaction information from bank SMS, UPI notifications, wallet
notifications, and credit/debit card SMS — using **mock data only**. No
Android permissions, native APIs, or background services are implemented in
this milestone; see [Future Proofing](#future-proofing) for what a real
implementation would add later without touching the rest of the app.

## Architecture

```
plugins/android-sms/
  types.ts        Shared types — no dependency on anything else here.
  parser.ts        Message text -> ParsedSmsTransaction. Pure functions, no React.
  normalizer.ts    Cleans up merchant/currency/whitespace/masked-account/date/reference fields.
  matcher.ts       Duplicate signature + duplicate detection, configurable tolerance.
  mock-data.ts     66 realistic mock SMS/notification fixtures.
  plugin.ts        Composes the above; implements the Plugin interface; settings,
                   statistics, health, Import Preview, and Ingestion Pipeline integration.
  __tests__/       Vitest unit tests for parser/normalizer/matcher/plugin.
```

`parser.ts`, `normalizer.ts`, `matcher.ts`, and the Plugin Framework
registration in `plugin.ts` are independent modules by design — each can be
understood, tested, and eventually replaced on its own. Only `plugin.ts`
imports anything from outside this folder.

## Flow

```
Raw SMS/Notification (mock-data.ts)
  -> parser.ts        (extract amount, merchant, type, method, reference, ...)
  -> normalizer.ts     (clean up merchant/currency/whitespace/date/account/reference)
  -> matcher.ts        (duplicate signature + duplicate check)
  -> plugin.ts          -> lib/ingestion/pipeline.ts's ingestTransaction()
                           (Merchant Extraction -> AI Memory -> Classifier)
                        -> lib/storage.ts's addTransactions()
  -> Financial Platform (dashboard, budgets, insights, forecast, feed, ...)
```

This plugin never constructs a `Transaction` object itself and never writes
to storage except through the same `ingestTransaction` + `addTransactions`
calls every other source (CSV, Manual Entry) already uses — "no plugin
writes transactions directly."

## Supported message templates

`parser.ts` runs an ordered list of small regex-based matchers (see the
`MATCHERS` array). Adding a new bank/wallet's phrasing is adding one matcher
function to that array — nothing else in the file changes. Currently
supported: UPI payments (sent/received), a bank SMS debiting to a UPI VPA,
salary credits, bill payments, credit/debit card usage, ATM withdrawals,
peer/bank transfers, refunds, failed/declined transactions, and wallet
payments (Paytm/PhonePe/Amazon Pay/Mobikwik). Anything that contains an
amount but matches no template is reported as `unknown-format`; anything
with no amount at all (OTPs, promos) is reported as `malformed` — both are
shown in the Import Preview rather than silently dropped.

**Failed transactions are recognized but never imported** — a
declined/reversed payment moved no money, so `plugin.ts` always marks a
`transactionType: "failed"` row `Skipped`, regardless of parse confidence.

## Extracted fields

Amount, Currency, Merchant, Transaction Type, Reference Number, Payment
Method, masked Account, Date, Time, Balance (if present), Raw Message, and a
0–1 Confidence score. See `types.ts`'s `ParsedSmsTransaction`.

## Duplicate detection

`matcher.ts` computes a signature per transaction: a UPI/bank reference
number if one exists (`ref:...`), otherwise a fallback of
date+amount+currency+merchant+payment method (`sig:...`). A reference-number
match is always a duplicate; a fallback-signature match additionally
requires the two messages to have arrived within a configurable
`duplicateToleranceMinutes` window, so two unrelated same-amount cash
transactions on different days aren't merged. Previously-imported signatures
persist in `localStorage` so the same message can never be re-imported
across sessions.

## Plugin Framework integration

- **Registration**: `plugin.ts` exports `androidSmsPlugin`, added to
  `lib/plugins/loader.ts`'s built-in plugin list — the same static,
  no-dynamic-loading approach every other built-in plugin uses.
- **Feed**: registers a Feed contributor (`registerFeedContributor`) that
  publishes an "Imported X new transactions" `system-insight` item after a
  successful import.
- **Search**: registers a Search-provider contributor
  (`registerIndexContributor`) that indexes each imported message's
  metadata into the Financial Semantic Index.
- **Coach**: registers via `lib/coach/contributors.ts`'s
  `registerCoachImportSummaryContributor` (a small extension point added
  alongside the Feed/Search ones) so the AI Financial Coach receives an
  import summary as background context — it only narrates this, it never
  re-parses or re-imports anything.
- **Workflow Engine**: after a successful import, `importSelected()` fires
  the existing `"transaction-imported"` trigger via
  `runWorkflowsForTrigger` — the same workflow every other source's
  imported transaction already traces through (merchant intelligence,
  classification, memory, recurring detection, forecast, feed, policy).
- **Notification Policy**: import feed items are always type
  `"system-insight"` with severity `"info"`, which the existing
  Automation & Notification Policy Engine's default rule (`ruleDefault` in
  `lib/policy/rules.ts`) keeps out of push/daily-briefing channels
  regardless of how old the underlying messages are — a bulk historical
  import should never itself trigger a notification. No core policy code
  needed to change for this.
- **Hooks**: fires the existing `"onTransactionImported"` Plugin Framework
  hook after a successful batch (previously defined but unused by any
  built-in code).

## Settings

`getSettings()` / `updateSettings()` (persisted in `localStorage`):
Supported Banks, Supported Wallets, Duplicate Tolerance (minutes),
Confidence Threshold, Auto Import (reserved for a future background-sync
milestone — scanning/importing here is always a manual action), and
Unknown Merchant Handling (`import-as-unknown` / `skip` /
`flag-for-review`).

## Dashboard

`/plugins/android-sms` (see `app/plugins/android-sms/page.tsx`, backed by
`components/SMSImportPage.tsx`): Plugin Status/Health, Mock SMS Count,
Imported Transactions, Duplicate Count, Parser Confidence, Last Import,
Parser Statistics, Plugin Settings, and an Import Preview table (Raw
Message / Merchant / Amount / Date / Confidence / Status) with per-row
checkboxes plus Select All / Clear / Import Selected actions. The generic
`/plugins` page also links here via a "Manage" button on this plugin's card.

## Testing

`npm test` runs the Vitest suite in `__tests__/`, covering: successful
parse, unknown merchant, duplicate detection (both reference-based and
fallback/tolerance-based), refund, salary credit, transfer, cash withdrawal,
failed transaction (always skipped), malformed message, and unsupported
format — plus the plugin's own registration/health/capabilities shape.

## Future Proofing

Designed so a real Android implementation can replace the mock layer
without touching the Financial Platform, the Ingestion Pipeline, or any of
the engines this plugin integrates with:

- Android SMS read permission / `NotificationListenerService` would replace
  `mock-data.ts` as the source of `RawSmsMessage[]` — `parser.ts` already
  consumes that exact shape.
- Background sync / incremental imports / real-time ingestion would call
  the same `scanMessages()` → `importSelected()` pair this dashboard calls
  manually, just on a timer or a system callback instead of a button click.
- Bank-specific parsers are new entries in `parser.ts`'s `MATCHERS` array.
- Cloud backup, offline import, and encrypted message storage are all
  storage-layer concerns that sit below `RawSmsMessage[]` and wouldn't
  change this plugin's own code at all.

## Explicitly out of scope for this milestone

Android native code, Capacitor, React Native, real permissions, Play
Services, Firebase, background services, real SMS-reading APIs, direct bank
integrations, OCR, a backend, and cloud sync.
