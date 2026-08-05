# IDOR Verification Report

Two distinct, confirmed IDOR vulnerabilities, both in the Connection Hub (`lib/connections/`). Both traced to exact source lines, both exploitable by any authenticated user against any other user's connection, given only a connection ID (a `cuid()` — not guessable in practice, but leakable via logs, browser history, screenshots, referrer headers, or any future feature that surfaces IDs, e.g. an admin panel or a shared support ticket). Everything else audited in [02](./02-authorization-audit.md) enforces ownership correctly or has no ownership dimension.

## Finding 1 (Critical): Connection Hub Server Actions have no authorization at all

**Location:** `lib/connections/actions.ts:17-44` (all four exports) and `lib/connections/engine.ts:81-144` (`disconnectConnection`, `refreshConnection`, `renameConnection`, `checkAndRecordHealth`).

**Mechanism:** Each Server Action takes a bare `id: string` and calls straight into the matching `engine.ts` function, which calls `getStoredConnection(id)` (`registry.ts:24` → `repositories/connection-repository.ts:55-58`, `prisma.connection.findUnique({ where: { id } })` — no `userId` in the `where` clause at all). **No function in this call chain ever checks a session, and none ever compares the row's `userId` to anyone's.**

**Exploitability:** confirmed, not theoretical. Server Actions are directly POST-able (Next.js exposes them as real HTTP endpoints under the hood, invoked via a `Next-Action` header against the originating route). Given any connection ID:
- `disconnectConnectionAction(id)` disconnects and wipes another user's connection.
- `refreshConnectionAction(id)` forces a token refresh cycle on another user's connection (wasted provider-API quota against that user's grant, and could push a healthy connection into an error/revoked state if it races a legitimate refresh).
- `renameConnectionAction(id, displayName)` renames another user's connection.
- `checkConnectionHealthAction(id)` triggers a live provider validation call using another user's stored credentials and overwrites their stored health status.

**Fix:** every one of these four actions must resolve the caller's `userId` from the session (`getCurrentUserId()`) and reject if absent, and every corresponding `engine.ts` function must accept that `userId` and verify `existing.userId === userId` before acting, throwing `ForbiddenError` otherwise. This is centralized in a new `lib/auth/authorize.ts` utility (`requireUserId()`, `assertOwnership()`) so the same two-line pattern is reused at every call site rather than reimplemented four times — see the remediation plan's Priority 1 for the exact design, implemented in this pass.

## Finding 2 (Critical): OAuth reconnect flow allows connection hijack and cross-user token retention

**Location:** `app/api/connections/[provider]/authorize/route.ts:29` (accepts `?reconnect=<id>` with no session check) → `lib/connections/session.ts` (stores it in a short-lived cookie, unverified) → `app/api/connections/[provider]/callback/route.ts:59` (passes it through as `existingConnectionId`) → `lib/connections/engine.ts:65-77` (`completeConnection`) → `lib/connections/providers.ts:162-190` (`connect()`).

**Mechanism, step by step:**
1. An attacker, signed in as themselves, requests `GET /api/connections/google/authorize?reconnect=<victim-connection-id>`. The authorize route never checks whether the caller owns `victim-connection-id` — it just base64-round-trips it through the OAuth session cookie (`lib/connections/session.ts:30-39`, `reconnectId` field).
2. The attacker completes a real Google OAuth consent **with their own Google account**. This is a genuine, valid authorization code — the vulnerability isn't in the OAuth exchange itself.
3. The callback route resolves `userId` correctly (the attacker's own session, `callback/route.ts:47`) and calls `completeConnection({ ..., userId: attackerUserId, existingConnectionId: "victim-connection-id" })`.
4. `providers.ts:162-164`: `existing = input.existingConnectionId ? await getStoredConnection(input.existingConnectionId) : ...` — fetches the **victim's** row by ID, with **no check that `existing.userId === input.userId`**.
5. `providers.ts:181-190` builds the replacement record: `id: existing?.id ?? crypto.randomUUID()` (keeps the **victim's row ID**), `userId: input.userId` (**overwrites ownership to the attacker**), and — this is the most severe part — `refreshToken: tokenResponse.refreshToken ? encryptToken(tokenResponse.refreshToken) : (existing?.tokens?.refreshToken ?? null)` (`providers.ts:173`). Google/Microsoft/Yahoo commonly omit `refresh_token` on a re-consent when one was already issued for that provider account. **If the attacker's own OAuth exchange happens to omit a fresh refresh token (a normal, common provider behavior, not something the attacker needs to force), this line falls back to the *victim's* still-valid encrypted refresh token** — now stored under a row the attacker owns (`userId` was just overwritten in step 5).
6. The attacker can now call `refreshConnectionAction` (once Finding 1 is fixed, this becomes reachable to the attacker legitimately, since they now — per the corrupted row — "own" this connection) to redeem the victim's refresh token for a live access token, or in the current unfixed state, could do so immediately via Finding 1's unauthenticated refresh path.

**Impact:** full hijack of another user's email/data-source connection, and a realistic path to obtaining a live, working access token against the victim's actual OAuth grant — i.e., read access to the victim's connected mailbox. This is more severe than Finding 1 alone because it doesn't just let an attacker *disrupt* another user's connection, it can result in the attacker gaining working credentials to the victim's real external account data.

**Fix (two layers, both implemented in this pass):**
1. **Authorize route:** require an authenticated session before accepting a `reconnect` param at all; verify the referenced connection belongs to the caller before storing it in the OAuth session cookie. If it doesn't belong to them (or doesn't exist), drop the reconnect intent and redirect with the same generic error pattern the route already uses for `unknown-provider` — never confirm or deny existence of another user's connection ID.
2. **Engine-layer defense-in-depth (the actual trust boundary):** `completeConnection` in `lib/connections/engine.ts` must independently verify ownership of `existingConnectionId` before calling `provider.connect()`, throwing `ForbiddenError` on mismatch — so this can never be exploited again even if a future code path reintroduces an unverified `reconnectId` upstream (e.g., a new UI entry point). This is the layer that actually prevents the token-retention bug, since it sits directly in front of the code that reuses `existing.tokens.refreshToken`.

## Findings not confirmed as exploitable (checked and cleared)

- `/api/me` — structurally IDOR-proof (§ [02](./02-authorization-audit.md)); no client-supplied ID.
- `/api/documents/upload` — structurally IDOR-proof; `organizationId` and `documentId` are both server-derived, never client-supplied.
- `services/documents/document-service.ts` and its repository — every function requires `organizationId` as an explicit parameter and every repository query filters by it (spot-checked `getDocument(organizationId, id)`); this is the pattern the Connection Hub fix in Finding 1 is being brought in line with.
- `lib/coach/coach.ts`'s two Server Actions — no resource IDs, no database access; ownership is enforced entirely by the caller that assembles their input (§ [02](./02-authorization-audit.md)).

## Verification method

Every finding above was confirmed by direct code tracing from entry point (Route Handler / Server Action signature) through every intermediate call to the actual Prisma query, not by pattern-matching on "looks unsafe." Two additional adjacent surfaces were traced and cleared explicitly (`/api/me`, `/api/documents/upload`) specifically to establish that the codebase's general pattern is authorization-correct and these two findings are a localized regression in the Connection Hub, not a systemic issue — which is also why the fix in this pass is narrowly scoped to `lib/connections/` rather than a broad rewrite.

Post-fix verification plan: extend `lib/connections/__tests__/engine.test.ts` (a real-database integration suite) with explicit cross-user negative tests — a second `otherUserId` created in the same `beforeAll`, asserting that every mutating engine function rejects when called with a connection belonging to `testUserId` but a `userId` argument of `otherUserId`, and that the reconnect flow rejects when `existingConnectionId` belongs to a different user than the one completing the OAuth exchange.
