# Connection Hub

A provider-agnostic OAuth 2.0 connection layer for Gmail, Outlook, and
Yahoo. **This milestone is authentication only** — no email is fetched,
parsed, or synchronized; see [Out of Scope](#explicitly-out-of-scope-for-this-milestone).

Every OAuth exchange in this module is real (Authorization Code + PKCE
against each provider's actual public endpoints) — nothing here is
mocked. You must supply your own OAuth app credentials (see
[Setup](#setup)) for any of it to actually work; without them, a
provider's card simply reports "not configured" instead of crashing.

## Architecture

```
lib/connections/
  types.ts            All shared types. StoredConnection (server-only, carries
                       encrypted tokens) vs. ConnectionRecord (the UI-safe
                       projection with no token field at all) is the key split.
  oauth.ts              Provider-agnostic Authorization Code + PKCE mechanics
                       (RFC 6749 + RFC 7636) — no provider-specific URL lives here.
  providers.ts           Google/Microsoft/Yahoo — real endpoints, scopes, and
                       userinfo field-mapping, built on a shared factory so the
                       connect/refresh/disconnect/health mechanics exist once.
  token-manager.ts        AES-256-GCM encryption (Node's built-in `crypto`, no
                       dependency) + expiry/proactive-refresh timing.
  registry.ts             Server-only persistence (see Storage below) + the
                       sanitized public read functions — the only place a
                       StoredConnection's `tokens` field is ever dropped.
  session.ts              The short-lived, single-use httpOnly cookie that
                       carries CSRF `state` + PKCE `codeVerifier` between the
                       authorize redirect and the callback redirect.
  health.ts               Pure health-status derivation + the live
                       provider-validation check.
  engine.ts               Core orchestration — the only module Route Handlers
                       and Server Actions call into. Framework-agnostic (no
                       next/headers import), so it's plain-function testable.
  actions.ts              "use server" Server Actions bridging UI buttons
                       (Disconnect/Refresh/Rename) to engine.ts.
  __tests__/              Vitest suite — see Testing below.

app/api/connections/[provider]/authorize/route.ts   Starts a Connect/Reconnect.
app/api/connections/[provider]/callback/route.ts     The one OAuth callback handler.
app/connections/page.tsx                             Server Component — the only
                                                       place ConnectionHub's data
                                                       comes from.
```

`providers.ts`, `token-manager.ts`, `registry.ts`, and `session.ts` never
import each other's internals beyond `types.ts` — `engine.ts` is the one
place that composes them.

## Security model

- **Tokens never reach the client.** `ConnectionRecord` (the only shape
  any component, Server Action, or Feed/Index/Coach contribution ever
  sees) has no token field — `registry.ts`'s `toConnectionRecord()` is the
  single place a `StoredConnection`'s `tokens` are dropped. Even the
  `ProviderCard`/`ConnectionDetails` UI never sees more than a token's
  *expiry timestamp*, never its value.
- **Encrypted at rest.** Every access/refresh token is AES-256-GCM
  encrypted (`token-manager.ts`) before it touches storage, with a key
  read from `CONNECTION_HUB_ENCRYPTION_KEY` — never hardcoded, never
  logged.
- **PKCE + CSRF state.** Every Authorization Code flow uses a fresh S256
  PKCE pair and a random `state`, both single-use and discarded the
  moment the callback consumes them (`session.ts`).
- **Server-side callback handlers only.** The two Route Handlers under
  `app/api/connections/[provider]/` are the only code that ever sees a
  raw authorization code or talks to a provider's token endpoint — no
  client secret is ever constructed anywhere else.
- **httpOnly, Secure, SameSite=Lax cookie** for the transient OAuth
  session (`session.ts`) — inaccessible to page JavaScript, never sent
  cross-site.
- **Disconnect wipes tokens**, not just a status flag — `providers.ts`'s
  `disconnect()` attempts revocation with the provider, then sets
  `tokens: null` on the stored record. A disconnected account keeps no
  secret material on file.

## Storage

This app has no database; every other framework here persists to
`localStorage` as a stand-in for one, but tokens can never touch
client-side storage. `registry.ts` instead persists encrypted
`StoredConnection`s to a JSON file under `.connections-data/` (gitignored,
server-only, unreachable from any `"use client"` file — Next.js refuses to
bundle `node:fs` into client code in the first place). A real production
deployment would swap this for a proper encrypted-at-rest database table;
nothing above `registry.ts`'s function signatures would need to change.

## Setup

1. Generate an encryption key: `openssl rand -base64 32`, set it as
   `CONNECTION_HUB_ENCRYPTION_KEY` in `.env.local`.
2. For each provider you want to test against a real account, register an
   OAuth app and set its redirect URI to
   `{your origin}/api/connections/{provider}/callback`:
   - **Google**: [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create OAuth client ID (Web application).
   - **Microsoft**: [Azure Portal](https://portal.azure.com) → App registrations → your app → Certificates & secrets. Redirect URI platform: Web.
   - **Yahoo**: [Yahoo Developer Network](https://developer.yahoo.com/apps/) → your app → API Permissions.
3. Copy each client ID/secret into `.env.local` (see `.env.example` for
   every variable name). A provider missing its env vars shows "not
   configured" on `/connections` instead of crashing.

## Provider Interface

```ts
interface ConnectionProvider {
  id, name, version, type; // type is always "oauth2" in this milestone
  buildAuthorizationUrl(params): string; // needed for a real Authorization Code
                                          // flow's redirect; not in the spec's
                                          // literal method list but unavoidable
  connect(input): Promise<StoredConnection>;
  disconnect(connectionId): Promise<void>;
  refreshToken(connectionId): Promise<StoredConnection>;
  validateConnection(connectionId): Promise<boolean>;
  health(connectionId): Promise<ConnectionHealth>;
  supportedScopes(): string[];
  supportedCapabilities(): ConnectionCapability[];
}
```

Adding a fourth provider (Google Drive/Calendar, Dropbox, OneDrive, Slack,
Discord, GitHub, Apple, an Open Banking API, an Account Aggregator, ...)
means one more call to `providers.ts`'s `createProvider()` factory with
that provider's own endpoints/scopes/userinfo mapping — nothing in
`engine.ts`, `registry.ts`, `oauth.ts`, `token-manager.ts`, `health.ts`,
the Route Handlers, or any UI component changes.

## System integration

- **Workflow Engine**: fires `"account-connected"` and `"disconnect"`
  (reused from the Account Aggregator milestone — semantically identical
  events) plus three new triggers this milestone adds:
  `"connection-token-refreshed"`, `"connection-failed"`,
  `"connection-permission-revoked"`.
- **Feed**: one item per connection's most recent lifecycle event —
  `"[Provider] connected"`, `"[Provider] disconnected"`,
  `"Connection expired"` (covers both an expired token and a
  provider-side revocation), and `"Connection restored"` (specifically a
  *re*connect, never confused with the original connect).
- **Semantic Index**: indexes every connection under a new `"connection"`
  `IndexObjectType`, with provider, scopes, status, and health in its
  metadata.
- **AI Financial Coach**: reuses the existing generic
  `registerCoachImportSummaryContributor` extension point (the same one
  the Account Aggregator and Document Intelligence milestones use) rather
  than adding a third bespoke Coach contribution shape — "healthy
  connections" maps to `importedCount`, "connections needing attention" to
  `failedCount`. This is an intentionally imperfect fit (there's no real
  "duplicate" or "import" concept for an OAuth connection); a dedicated
  `ConnectionCoachSummary` shape wired into
  `lib/intelligence/orchestrator.ts`'s `CoachInput` assembly would be the
  correct enhancement, but that crosses into shared orchestrator code this
  milestone deliberately leaves untouched. The Coach never accesses a
  token or calls a provider — only these pre-computed counts.

## Testing

`npm test` runs the Vitest suite in `__tests__/`: `token-manager.test.ts`
(encrypt/decrypt round-trip, tamper detection, expiry timing) and
`oauth.test.ts` (PKCE/state generation, Authorization Code/refresh/
userinfo/revoke against a mocked `fetch`) are pure unit tests; `health.test.ts`
covers status-derivation precedence and revocation-error classification;
`engine.test.ts` is the integration suite covering every scenario the
milestone asks for — Google/Microsoft/Yahoo OAuth success flows, Google
token refresh, Revoked Permission Detection, Authentication Failure,
Reconnect, and Disconnect — each via a mocked `fetch` returning the real
shape each provider's actual token/userinfo endpoint returns. The two
Route Handlers are intentionally thin (parse params, call `engine.ts`,
set/read a cookie, redirect) specifically so all real logic lives in
plain, Vitest-testable functions; they're verified by code review and
manual testing against real provider credentials rather than an automated
request-mocking test, which would mostly be testing Next.js's own
routing rather than this module's logic.

## Explicitly out of scope for this milestone

Email synchronization, email parsing or extraction, financial data
extraction from emails, receipt processing, background sync, cloud
backups, notification delivery, and OCR. This milestone only manages the
authenticated connection — see the Email Intelligence Framework
(`lib/email/`) for where a *future* milestone would use these tokens to
actually fetch mail, once its mock Gmail provider is replaced with the
real one this Connection Hub authenticates.
