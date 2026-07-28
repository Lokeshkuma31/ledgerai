# Gmail Provider

The first (and, in this milestone, only) implementation of the Email
Intelligence Framework's `EmailProvider` interface (`lib/email/provider.ts`).
**Mock data only** — no Gmail API call, no OAuth flow, no network request.
See [Future Compatibility](#future-compatibility) for what a real
implementation would replace without any change to `lib/email/`.

## Files

```
plugins/gmail/
  mock-provider.ts   Fixture email bodies (MOCK_EMAIL_BODIES) and the fixed
                     RawEmail[] fixture list every fetchEmails() call returns.
  plugin.ts           GmailProvider — implements EmailProvider; registers the
                     singleton with lib/email/registry.ts as a module-level
                     side effect (mirrors lib/banks/providers.ts's pattern).
  README.md           This file.
```

## What it returns

`getAllMockEmails()` covers every `EmailType` the framework classifies
(Receipt, Invoice, Subscription Renewal, Refund, Salary Slip, Utility Bill,
Credit Card Statement, Bank Statement, Flight Booking, Hotel Booking,
Insurance, Loan, Investment Report, Tax Document) plus an Unknown Email, a
Malformed Email (weakly receipt-like but with no extractable amount), and an
Empty Email (no body at all). `fetchEmails("incremental")` returns only the
most recent four; `fetchEmails("full"/"manual")` returns the full fixed list
— calling it twice is exactly how the test suite (and the dashboard's
"Sync Now" button) exercises Duplicate Detection.

Four messages carry an attachment whose `mockTextKey` points directly at
`plugins/document-intelligence/mock-documents.ts`'s own fixtures
(`credit-card-statement`, `salary-slip`, `utility-bill`, `bank-statement`) —
this provider never invents document text of its own; it reuses Document
Intelligence's fixtures by reference.

## Test scenario toggles

`createGmailProvider({ failConnect?, failFetch? })` (the factory, distinct
from the registered singleton `gmailProvider`) mirrors
`lib/banks/providers.ts`'s `DemoBankB` failure-injection options, letting
`lib/email/__tests__/engine.test.ts` exercise a connection failure and a
fetch failure without a second provider class.

## Future Compatibility

`plugin.ts` implements nothing but the published `EmailProvider` interface —
a real integration replaces only this directory:

- A real **Gmail API** provider would use OAuth for `connect()`/`disconnect()`
  and call the Gmail REST API for `fetchEmails()`, returning the same
  `RawEmail[]` shape (already-resolved `body` text, not a "mock key").
- **Microsoft Graph**, **IMAP**, **Exchange**, and **Yahoo Mail** are each an
  additional `EmailProvider` implementation registered the same way, letting
  multiple mailboxes coexist on `/email` simultaneously.
- **Webhooks** (push notifications instead of polling), **incremental sync**
  (already modeled by `EmailSyncType`'s `"incremental"` value), **background
  synchronization**, and **offline indexing** are all scheduling/transport
  concerns layered on top of `lib/email/engine.ts`'s existing
  `runEmailSync()` call — none of them require a change to `lib/email/`
  itself.

## Explicitly out of scope for this milestone

Real Gmail OAuth, real Gmail/IMAP/Graph API calls, cloud sync, backend
infrastructure, and any credit-consuming external call.
