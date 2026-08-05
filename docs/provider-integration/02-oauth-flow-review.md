# 2. OAuth Flow Review

## 2.1 Headline finding: Gmail/Outlook/Yahoo OAuth is already production-real

Unlike every other document in this set, this one is mostly an audit of existing, shipped code, not a design for new code. `lib/connections/` (`oauth.ts`, `providers.ts`, `token-manager.ts`, `registry.ts`, `session.ts`, `engine.ts`, `health.ts`) implements a real Authorization Code + PKCE (RFC 6749 + RFC 7636) flow against Google, Microsoft, and Yahoo's actual public endpoints — no mocking, no third-party SDK, no simulated redirect. This was confirmed by direct inspection of `lib/connections/providers.ts:264-317` (real `accounts.google.com`/`login.microsoftonline.com`/`api.login.yahoo.com` endpoints) and `lib/connections/README.md`'s own claim ("Every OAuth exchange in this module is real... nothing here is mocked"), cross-checked against the actual `fetch()` calls in `oauth.ts:90-167`.

**What this means for scope**: this document is not "design the OAuth flow." It is "confirm the existing flow is correct, document its current behavior precisely, and identify the one integration point that changes" — connecting the already-issued, already-encrypted tokens to the (currently mock) `EmailProvider`/`BankConnector` fetch layer.

## 2.2 Per-provider flow, as implemented today

| Step | Google (Gmail) | Microsoft (Outlook) | Yahoo |
|---|---|---|---|
| Authorization endpoint | `accounts.google.com/o/oauth2/v2/auth` | `login.microsoftonline.com/common/oauth2/v2.0/authorize` | `api.login.yahoo.com/oauth2/request_auth` |
| Token endpoint | `oauth2.googleapis.com/token` | `login.microsoftonline.com/common/oauth2/v2.0/token` | `api.login.yahoo.com/oauth2/get_token` |
| Userinfo endpoint | `openidconnect.googleapis.com/v1/userinfo` | `graph.microsoft.com/v1.0/me` | `api.login.yahoo.com/openid/v1/userinfo` |
| Revocation endpoint | `oauth2.googleapis.com/revoke` | **none published** — disconnect discards the local token only | **none published** — same fallback |
| Scopes requested | `openid email profile https://www.googleapis.com/auth/gmail.readonly` | `openid email profile offline_access Mail.Read` | `openid email profile` (**no mail scope** — see 2.2.1) |
| Refresh token issuance | Forced via `access_type=offline&prompt=consent` (`lib/connections/oauth.ts:57-58`) on every connect, so a refresh token is guaranteed even on a re-consent | `offline_access` scope requests one; Microsoft may omit `refresh_token` on a refresh response — handled (`providers.ts:81`: keep prior token when omitted) | Standard OAuth2; same omit-on-refresh handling applies |
| Capabilities granted | `identity`, `email-read` | `identity`, `email-read` | `identity` **only** |

### 2.2.1 Yahoo is not actually wired for mail yet — this is a real gap, not an oversight

`lib/connections/providers.ts:314-315`'s own metadata states it plainly: *"Yahoo account — identity only; Yahoo Mail API access requires separate partner approval."* Yahoo Mail's API is not self-service like Gmail/Graph — it requires a Yahoo Developer Network partner application and approval process outside this codebase's control. **This is a hard external dependency with unknown lead time and must be flagged to the business stakeholder before the Rollout Plan (§8) commits to a Yahoo ship date.** Until approval lands, Yahoo can only ever provide identity (`sub`/`email`/`name`) — it cannot fetch mail, and the `EmailProvider` implementation for Yahoo cannot be built, only stubbed to return an explicit "not yet available" health status.

## 2.3 Token lifecycle — refresh strategy, rotation, expiration

All already implemented in `lib/connections/token-manager.ts` and reused verbatim by every real provider:

- **Proactive refresh threshold**: `shouldRefresh()` triggers 300 seconds (`REFRESH_THRESHOLD_SECONDS`, `token-manager.ts:59`) before actual expiry. `lib/connections/engine.ts`'s `checkAndRecordHealth()` and the hourly `connection-validate` Inngest cron (`lib/jobs/functions/connections.ts`) both call through `providers.ts`'s `health()`, which calls `refreshToken()` proactively when `shouldRefresh()` is true (`providers.ts:234-241`).
- **Clock skew tolerance**: `isExpired()` treats a token as expired 60 seconds (`EXPIRY_SKEW_SECONDS`) before its literal `expiresAt` — avoids a token being valid-by-a-second at read time and expired-by-the-time-the-request-lands.
- **Rotation**: token rotation is provider-controlled, not app-controlled — a refresh response may or may not include a new `refresh_token`. All three providers are handled identically: keep the prior encrypted refresh token when the response omits one (`providers.ts:81`, `:173`). This is correct per RFC 6749 §6 behavior for all three providers as of this design.
- **Encryption at rest**: AES-256-GCM via Node's built-in `crypto` (no third-party dependency), key from `CONNECTION_HUB_ENCRYPTION_KEY` env var, 32-byte requirement enforced at read time with a clear startup-time error if unset or wrong length (`token-manager.ts:20-32`). GCM's auth tag makes tampering/corruption fail loudly (`decryptToken` throws) rather than silently returning wrong plaintext.
- **Storage**: `Connection.tokens` (Postgres `Json` column, `prisma/schema.prisma:269`) stores the serialized `TokenSet` — `{accessToken: EncryptedPayload, refreshToken: EncryptedPayload | null, expiresAt, tokenType, scopes}` — where `EncryptedPayload` is `{ciphertext, iv, authTag}`, all base64. `Connection.tokenExpiresAt`/`scopes` are denormalized copies for query filtering without JSON parsing.
- **Wipe on disconnect**: `disconnect()` sets `tokens: null` on the stored record after best-effort revocation (`providers.ts:206-224`) — no secret material survives a disconnect, satisfying "safely disable... without data loss" for §9 (Rollback) at the token layer specifically (transaction/sync history is untouched by a disconnect).

## 2.4 Account Aggregator: not OAuth2, needs its own consent-handshake module

The AA framework (India's RBI-regulated Account Aggregator ecosystem — Sahamati as the central registry, AA apps like Setu/Finvu/OneMoney/CAMS Finserv as the actual FIU-facing integration point) is **not** an OAuth 2.0 flow, despite `plugins/account-aggregator/auth.ts`'s `connect()`/`refreshSession()`/`disconnectSession()` naming looking OAuth-shaped. The real protocol is:

1. **Consent request** (FIU → AA): the app (as a Financial Information User) submits a `ConsentDetail` — purpose, FI types, account discovery criteria, consent validity window — to the chosen AA's Gateway API.
2. **Consent approval** (redirect to AA app, not the bank): the user is redirected to their AA app (Setu/Finvu/etc.), authenticates there (bank-agnostic), and approves/denies which linked accounts to share.
3. **Consent artifact**: on approval, the FIU receives a `consentId` + `consentHandle`, not a bearer access token.
4. **FI data flow**: the FIU requests a `FIDataRange` window; the AA asynchronously pushes encrypted financial data via a webhook (`FI Notification`) rather than the FIU pulling it synchronously like a REST API.
5. **Data encryption**: FI data is encrypted end-to-end (ECDH key exchange + AES-GCM per the ReBIT/Sahamati technical spec) — the AA itself cannot read the financial data, only the FIU and FIP (bank) can, meaning **this app must run its own ECDH key derivation and decryption**, a materially different crypto surface than `token-manager.ts`'s symmetric-key-at-rest model.

**Architectural decision for this plan**: extend `Connection`'s `provider` enum with a fourth value (`account_aggregator`) and repurpose `Connection.tokens` to store the encrypted `consentHandle` + the FIU's own AA-session ECDH private key material (itself then AES-256-GCM-wrapped by `CONNECTION_HUB_ENCRYPTION_KEY`, nesting the two encryption layers rather than replacing one with the other) — this gives AA the same UI/health/audit parity every other provider gets (Connection Hub lists it, `connection-validate` can check consent status, disconnect revokes it) without pretending AA's consent artifact is a bearer token it is not. `lib/connections/providers.ts`'s `createProvider()` factory is **not** reused as-is for AA — its `exchangeCodeForTokens`/`refreshAccessToken` calls assume an OAuth token endpoint that doesn't exist in the AA spec. A new, parallel `createConsentProvider()` factory should be built satisfying the same `ConnectionProvider` interface (`connect`/`disconnect`/`refreshToken`/`validateConnection`/`health`/`metadata`) but implementing AA's actual consent-request → redirect → consent-artifact → FI-notification-webhook sequence underneath. `plugins/account-aggregator/auth.ts`'s current mock already models the right *shape* (`connect()` → consent object; `refreshSession()` → consent revalidation; `disconnectSession()` → consent revocation) — a real implementation keeps this shape and replaces `mock-provider.ts`'s synchronous fixture calls with actual Sahamati Gateway API calls plus a new webhook Route Handler for the asynchronous FI Notification callback (a genuinely new endpoint, since nothing in the current Route Handler set — `app/api/connections/[provider]/{authorize,callback}` — expects an unsolicited provider-initiated webhook).

## 2.5 Security posture — what's already correct, unchanged by this plan

Every item below is existing, tested behavior (`lib/connections/README.md`'s "Security model" section, verified against `engine.ts`/`token-manager.ts`/`oauth.ts` source) and this plan does not touch it:

- **Tokens never reach the client** — `ConnectionRecord` (the only shape any component/Server Action/Feed/Index/Coach contribution ever sees) has no token field at all; `registry.ts`'s `toConnectionRecord()` is the sole place `tokens` is dropped.
- **PKCE + CSRF state**, single-use, discarded after the callback consumes them (`session.ts`, httpOnly/Secure/SameSite=Lax cookie).
- **Server-side callback handlers only** — `app/api/connections/[provider]/{authorize,callback}/route.ts` are the only code paths that ever see a raw authorization code or construct a client secret.
- **Ownership re-verified server-side on every mutating call** — `assertOwnership()` (`lib/connections/engine.ts:81-88`, `:138`, `:166`, `:200`, `:228`) is called independently for disconnect/refresh/rename/health-check, closing the IDOR class documented in `docs/security-hardening/03-idor-verification-report.md`.
- **Audit trail** — every OAuth lifecycle transition (`connection.created`, `.reconnected`, `.disconnected`, `.token_refreshed`, `.token_refresh_failed`, `.permission_revoked`, `.renamed`) writes an `AuditLog` row via `recordAuditEvent()` (`lib/connections/engine.ts`, throughout), which per `docs/observability/08-privacy-review.md` never logs token material and never throws.

## 2.6 What actually changes under this plan

1. **Nothing in `lib/connections/`** for Gmail/Outlook — the existing OAuth client is reused as-is by the new fetch-layer providers (§1.5), which call `decryptToken()` to obtain a bearer token for a Gmail API / Graph API request. No new env vars, no new Route Handlers, no schema change to `Connection` for these two.
2. **Yahoo is blocked on external partner approval** (§2.2.1) — no code change possible until that lands; track as an explicit external dependency, not an engineering task.
3. **Account Aggregator needs a new consent-handshake module** (§2.4) — the only provider in this plan requiring new OAuth-adjacent infrastructure (a new `createConsentProvider()` factory, a new webhook Route Handler, an extended `Connection.provider` enum, and a nested-encryption token storage scheme).
4. **Observability instrumentation** (cross-referenced from `docs/observability/04-tracing-strategy.md`, which already names "OAuth" as an instrumented span category) — every `exchangeCodeForTokens`/`refreshAccessToken`/`fetchUserInfo`/`revokeToken` call gets a span (`oauth.exchange`, `oauth.refresh`, `oauth.userinfo`, `oauth.revoke`) tagged with `provider` and outcome, and a `connection_token_refreshed`/`connection_token_refresh_failed` metric/analytics event (already partially wired via `capture()` in `engine.ts:191`) — extended to also emit on Account Aggregator's consent-refresh path once built.

## 2.7 Never-logged (inherits `docs/observability/08-privacy-review.md` verbatim)

Access tokens, refresh tokens, PKCE `code_verifier`/`state`, session cookies, the `CONNECTION_HUB_ENCRYPTION_KEY`, and — new to this document — the AA ECDH private key material and any raw `FIDataRange` financial payload before it's mapped into a `Transaction`. Allowed: user ID, connection ID, provider name, token *expiry timestamp* (never the value), scopes list, and consent status enum values (`Granted`/`Denied`/`Expired`) with no linked-account identifiers beyond a count.
