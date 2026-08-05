# Authorization Audit

Systematic review of **every** Server Action and Route Handler in the codebase. This is a complete inventory, not a sample: confirmed via `grep -rl '^"use server"'` (2 files) and `Glob app/api/**/route.ts` (5 files) against the full repo.

## Route Handlers (5 total)

### `app/api/auth/[...all]/route.ts`
- **Current authorization logic:** none of its own — delegates entirely to `toNextJsHandler(auth)` (better-auth's own handler), which manages its own sign-in/sign-up/session logic internally.
- **Ownership verification:** N/A — this *is* the identity provider; there's no "resource" to own yet at this layer.
- **Operations:** read (session check), create (sign-up), update (sign-in issues new session) — all internal to better-auth.
- **Gap:** excluded from `middleware.ts`'s rate limiter by design (`needsRateLimit()` explicitly skips `/api/auth`), on the stated assumption that better-auth throttles itself internally. **This assumption was not verified against `lib/auth/better-auth.ts`'s actual config** (no rate-limit option is set there). Login/password-reset/sign-up are the classic brute-force/enumeration targets — this is the highest-priority rate-limiting gap. See [05](./05-rate-limiting-strategy.md).
- **IDOR risk:** none identified — better-auth's session/account model is inherently self-scoped.

### `app/api/me/route.ts` (`GET`)
- **Current authorization logic:** `getCurrentSession()` (`app/api/me/route.ts:24`) — throws `UnauthorizedError` if absent (line 25).
- **Ownership verification:** `getCurrentMembership()` (line 27) derives the organization from the *session's own* user — there is no client-supplied ID anywhere in this request, so there's nothing to check for cross-user access. Structurally IDOR-proof.
- **Operations:** read only.
- **Gap:** none. This is the reference-correct pattern: identity resolved server-side, zero client-supplied identifiers.

### `app/api/documents/upload/route.ts` (`POST`)
- **Current authorization logic:** `getCurrentUserId()` + `getCurrentOrganizationId()` (lines 37-38), 401 if either is null (line 39-41).
- **Ownership verification:** the resulting presigned upload URL is scoped to `organizationId` derived from the session (`getDocumentUploadUrl(organizationId, ...)`, line 53) — the client never supplies an organization/owner ID that could be swapped for someone else's. `documentId` is server-generated (`crypto.randomUUID()`, line 52), not client-supplied. Structurally IDOR-proof for this operation.
- **Operations:** create (issues an upload URL) only — no read/update/delete/list here.
- **Gap:** rate limiting — falls under the generic `apiRateLimit` only (60/60s), same limit as read-only traffic, despite writing to paid storage (R2) and being a more attractive abuse target (cost amplification, storage exhaustion). See [05](./05-rate-limiting-strategy.md).

### `app/api/connections/[provider]/authorize/route.ts` (`GET`)
- **Current authorization logic:** **none** — no session check anywhere in this handler.
- **Ownership verification:** N/A for a fresh connect (nothing owned yet). For the `?reconnect=<id>` query param path (line 29, `reconnectId`), **the ID is read and threaded straight into the OAuth session cookie with no verification that the caller owns that connection** — however, this alone doesn't leak or mutate anything: the reconnect ID is only *consumed* later, in the callback handler, where `completeConnection` is called (see below). This route by itself does not read or return any connection data; it only builds a redirect URL. Confirmed non-exploitable on its own, but flagged because it's the origin of an unverified `reconnectId` that flows downstream — see the callback handler.
- **Operations:** none directly (it's a redirect-only handler).
- **Gap:** should require an authenticated session before accepting a `reconnect` ID, even though the current downstream code happens to be safe — see [03 — IDOR Verification Report](./03-idor-verification-report.md#finding-2-unauthenticated-reconnect-id-acceptance-defense-in-depth) for why this is still worth closing.

### `app/api/connections/[provider]/callback/route.ts` (`GET`)
- **Current authorization logic:** `getCurrentUserId()` (line 47), redirects to `/sign-in` if absent (line 48-49).
- **Ownership verification:** **this is the critical finding.** `completeConnection` is called with `userId` (the *current* session's user, correctly resolved) **and** `existingConnectionId: session.reconnectId` (line 59) — the reconnect ID that originated, unverified, from the authorize route above. `completeConnection` (`lib/connections/engine.ts:65-77`) passes both straight to `provider.connect(...)` (`lib/connections/providers.ts`), which — **confirmed by direct inspection** — upserts using `existingConnectionId` as the target row's ID without first checking that row's existing `userId` matches the new `userId`. See [03](./03-idor-verification-report.md) for the full trace and exploitability assessment.
- **Operations:** create, and effectively update-in-place (reconnect).
- **Gap:** **IDOR — Finding 1 (Critical).** See [03](./03-idor-verification-report.md).

## Server Actions (2 files, 6 total exported actions)

### `lib/connections/actions.ts` (4 actions — the primary finding)

| Action | Current auth | Ownership check | Operation | Status |
|---|---|---|---|---|
| `disconnectConnectionAction(id)` (line 17) | **None** — no session lookup at all in the action | **None** — calls `disconnectConnection(id)` (`engine.ts:81`), which calls `getStoredConnection(id)` (bare ID, no scoping) | delete/disconnect | **IDOR — Finding 1** |
| `refreshConnectionAction(id)` (line 23) | **None** | **None** — same pattern via `refreshConnection(id)` (`engine.ts:90`) | refresh | **IDOR — Finding 1** |
| `renameConnectionAction(id, displayName)` (line 34) | **None** | **None** — same pattern via `renameConnection(id, ...)` (`engine.ts:112`) | update/rename | **IDOR — Finding 1** |
| `checkConnectionHealthAction(id)` (line 40) | **None** | **None** — same pattern via `checkAndRecordHealth(id)` (`engine.ts:130`) | read (triggers a live provider check + persists health) | **IDOR — Finding 1** |

All four are real Next.js Server Actions — directly POST-able by any authenticated (or, since there's no session check, arguably *any*) client with nothing but a guessed/observed connection ID string. Confirmed unused-elsewhere `getConnectionDetails(id)` (`engine.ts:152`) has the same unscoped-read pattern; it has no current caller but is exported from `engine.ts` and should be fixed for the same reason.

**Why this happened (not a criticism, a root-cause note for the fix):** `registry.ts`'s own doc comment (line 13-15) states list/lookup functions "take a `userId` to scope their query now that connections belong to real Better Auth users" — the *list* operation (`getAllStoredConnections(userId)`, used by `getConnections(userId)` in every page) was correctly scoped. The single-record lookup (`getStoredConnection(id)`) was not updated to match when the same migration happened — an inconsistency with the pattern the codebase already uses correctly for documents (`services/documents/document-service.ts` threads `organizationId` through every function, including single-record `getDocument(organizationId, id)`). The fix in [03](./03-idor-verification-report.md) brings connections in line with that existing, correct pattern rather than inventing a new one.

### `lib/coach/coach.ts` (2 actions — not resource-scoped, no ownership check applicable)

| Action | Current auth | Ownership check | Assessment |
|---|---|---|---|
| `generateFinancialSummary(input: CoachInput)` (line 339) | None in this function | N/A | Takes a fully-formed, already-computed analytics payload as input — no database access, no ID parameters, no user/org context of its own. Ownership is enforced entirely by whoever assembles `CoachInput` before calling this (a Server Component that already resolved `organizationId` from the session and queried only that org's data). This function cannot leak cross-user data because it never touches storage. |
| `answerFinancialQuery(question, intent, context: QueryContext)` (line 388) | None in this function | N/A | Same shape — `context` is pre-assembled by the caller from already-org-scoped data. |

**Assessment:** these two are correctly designed — authorization is enforced upstream, at the point where `CoachInput`/`QueryContext` are assembled, not inside the LLM-calling function itself. Flagged here only for completeness of "every Server Action reviewed"; no fix required. (Not independently re-verified in this pass: the Server Component call sites that assemble `CoachInput`/`QueryContext` — worth a spot-check in a future pass, but out of scope here since it's a different call pattern than the Connection Hub's client-invoked mutations.)

## Summary table

| Surface | Read | Update | Delete | Refresh | Disconnect | Rename | Sync |
|---|---|---|---|---|---|---|---|
| `/api/me` | ✅ protected | — | — | — | — | — | — |
| `/api/documents/upload` | — | — | — | — | — | — | ✅ protected (create) |
| `/api/connections/[provider]/authorize` | — | — | — | — | — | — | 🟡 unauthenticated reconnect-id accepted (defense-in-depth gap, not independently exploitable) |
| `/api/connections/[provider]/callback` | — | 🔴 **unprotected** (reconnect path) | — | — | — | — | 🔴 **unprotected** (reconnect path) |
| `disconnectConnectionAction` | — | — | 🔴 **unprotected** | — | 🔴 **unprotected** | — | — |
| `refreshConnectionAction` | — | — | — | 🔴 **unprotected** | — | — | — |
| `renameConnectionAction` | — | 🔴 **unprotected** | — | — | — | 🔴 **unprotected** | — |
| `checkConnectionHealthAction` | 🔴 **unprotected** | — | — | — | — | — | — |
| `generateFinancialSummary` / `answerFinancialQuery` | ✅ N/A (no resource ID) | — | — | — | — | — | — |

There is currently no "sync-trigger" endpoint of any kind (confirmed in the production-readiness audit) — the "Sync" column above reflects only the reconnect path's implicit re-sync-on-reconnect behavior, not a dedicated sync API.

See [03 — IDOR Verification Report](./03-idor-verification-report.md) for exploitability confirmation and the fix design.
