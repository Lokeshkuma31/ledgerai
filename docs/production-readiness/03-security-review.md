# 3. Security Review

Assessed against the launch requirement: rate limiting, CSRF, CSP, XSS protection, secure headers, session rotation, token encryption, audit logging, least privilege. Every item below is verified against the current codebase, not inferred from dependencies.

## 3.1 Findings summary

| Area | Status | Severity if unaddressed |
|---|---|---|
| Connection Hub OAuth ownership check (IDOR) | **Missing** | Critical |
| Security response headers (CSP/HSTS/X-Frame-Options/etc.) | **Missing** | Critical |
| Per-endpoint rate limiting (login, OAuth callback, upload, AI chat) | **Missing** (generic 60/60s only) | High |
| Audit logging | **Schema exists, zero writes** | High |
| CSRF (general app) | **Partial** — only Connection Hub OAuth has explicit protection | Medium |
| Environment variable validation at boot | **Missing** | Medium |
| RBAC enforcement (`Membership.role`) | **Field exists, never checked** | Medium |
| Token encryption at rest | **Implemented correctly** | — |
| Session management (better-auth) | **Implemented, defaults not reviewed** | Low-Medium |
| Secrets hygiene | **Clean** — no hardcoded secrets found | — |

## 3.2 Critical: IDOR in Connection Hub Server Actions

`lib/connections/actions.ts:17-38` (`disconnectConnectionAction`, `refreshConnectionAction`, `renameConnectionAction`) accept a bare `connectionId` and pass it straight to `lib/connections/engine.ts`, which resolves the connection by `id` alone (`getStoredConnection(id)`) — **it never compares the connection's `userId` to the session's current user**. Any authenticated user who obtains or guesses another user's connection ID (UUIDs mitigate guessing, but not leakage via logs, URLs, screenshots, or a future admin UI) can disconnect, rename, or force-refresh someone else's bank/email connection.

**Fix:** every Server Action and engine entry point that takes a `connectionId` must load the connection scoped to `(id, userId)` — or load by `id` then assert `connection.userId === session.user.id` before acting, throwing `ForbiddenError` otherwise. This is a small, contained fix (the `AppError` hierarchy in `lib/api/errors.ts` already has `ForbiddenError`) and should be treated as a launch blocker, not a backlog item.

## 3.3 Critical: no security response headers

`next.config.ts` is the unmodified `create-next-app` stub. No `headers()` function exists; `middleware.ts` sets no response headers. Concretely absent:

- **Content-Security-Policy** — with an AI Coach that likely renders LLM-influenced content and a document-upload flow, CSP is the primary defense-in-depth layer against stored/reflected XSS. Its absence is not compensated for elsewhere (no DOMPurify/sanitizer usage found in the audited services).
- **Strict-Transport-Security** — should be set even though Vercel terminates TLS; HSTS preload matters for a fintech-adjacent product handling OAuth tokens.
- **X-Frame-Options / frame-ancestors** — clickjacking protection for a dashboard that displays financial data and can trigger destructive actions (disconnect, delete).
- **X-Content-Type-Options: nosniff**, **Referrer-Policy**, **Permissions-Policy** — standard baseline, all absent.

**Fix:** add a `headers()` block to `next.config.ts` (or set headers in `middleware.ts` if per-route variation is needed, e.g., relaxed CSP for OAuth redirect pages). This is low-effort, high-value — should be one of the first fixes made.

## 3.4 High: rate limiting is a single blunt instrument

`lib/cache/redis.ts:32-36` defines exactly one limiter (`apiRateLimit`, sliding window, 60 req/60s), applied uniformly to all of `/api/*` except `/api/auth/*` in `middleware.ts:20-22`. The code's own comments (`redis.ts:28-31`, `middleware.ts:16-18`) already flag this as a known gap ("dedicated, tighter limiters for sensitive endpoints... are future, separate work"). Confirmed unprotected by anything beyond the generic limiter:

- `/api/auth/*` (better-auth's own routes) — the comment claims better-auth "handles its own throttling," but this was **not verified** in the audit (`lib/auth/better-auth.ts` config wasn't confirmed to set a rate-limit option) — treat as unverified, not confirmed-safe. Login/password-reset endpoints are the classic brute-force target and deserve their own strict limiter regardless.
- `/api/connections/[provider]/callback` — OAuth callback abuse (token exchange retries) gets only the generic 60/60s.
- `/api/documents/upload` — presigned-URL issuance should be limited more tightly per-user than generic API traffic, both for cost control (R2 egress/storage) and abuse prevention.
- Any future AI Coach chat endpoint — LLM calls are the most expensive per-request operation in the system and need their own budget-aware limiter before that route ships.

**Fix:** extend `lib/cache/redis.ts` with named limiters (`authRateLimit`, `oauthCallbackRateLimit`, `uploadRateLimit`, `aiChatRateLimit`) at tighter thresholds, and apply them at the route level (not just middleware) so each sensitive handler enforces its own limit independent of the generic one.

## 3.5 High: audit logging is schema-only

`prisma/schema.prisma:118-136` defines a complete `AuditLog` model (action, entityType/Id, before/after JSON diffs, IP, indexed by org+entity) — good design. But `grep -r "auditLog.create"` across the entire codebase returns **zero matches**. Nothing writes to it. For a fintech app, this means: no record of who connected/disconnected a bank or email account, no record of login events, no record of permission changes, no forensic trail if a support/security incident occurs.

**Fix:** add a thin `lib/audit/log.ts` helper and call it from every sensitive mutation path — start with: connection create/disconnect/refresh (`lib/connections/`), auth events (sign-in/sign-out/password-reset via better-auth hooks), and document upload/delete. This should ship alongside the IDOR fix in 3.2, since fixing authorization without adding audit coverage of the actions being authorized is only half the control.

## 3.6 Medium: no general CSRF token scheme

Connection Hub OAuth has its own explicit CSRF defense (signed state cookie + comparison on callback, `lib/connections/session.ts`, `callback/route.ts:41`) — that part is correct. But there is no app-wide CSRF token mechanism for Server Actions or mutating routes outside the OAuth flow; protection there relies entirely on better-auth's same-site cookie defaults. This is a **reasonable baseline** for same-origin Server Actions in modern Next.js (same-site=lax/strict cookies substantially mitigate classic CSRF), but should be explicitly verified: confirm better-auth's cookie `sameSite` setting, and confirm no mutating route accepts unauthenticated cross-origin form posts. Treat as medium, not critical, but worth an explicit verification pass rather than an assumption.

## 3.7 Medium: RBAC field exists but is never enforced

`Membership.role` (`OWNER/ADMIN/MEMBER/VIEWER`, `lib/auth/session.ts:37`) is returned via `/api/me` but not checked in any sampled route or action. If the launch scope includes any multi-member-organization features (shared household/business finances), every mutating route needs an explicit role check before launch — currently any member, regardless of role, can presumably perform any action any other member can. If the initial launch is single-user-per-organization only, this is lower urgency but should be documented as an explicit scope decision, not a silent gap.

## 3.8 Medium: no environment variable validation

Each module (`lib/storage/r2.ts`, `lib/cache/redis.ts`, `lib/connections/providers.ts`) validates its own required env vars lazily, and `lib/db/prisma.ts` doesn't validate `DATABASE_URL` at all. A misconfigured production deploy fails at first use of the affected code path — potentially mid-request, in front of a real user — rather than at boot. See [02 — Deployment Architecture §2.3](./02-deployment-architecture.md#23-environment-variable-validation) for the fix (a single Zod-validated `lib/env.ts`).

## 3.9 What's already correct — don't rebuild these

- **Token encryption**: `lib/connections/token-manager.ts:34-53` implements real AES-256-GCM, keyed by `CONNECTION_HUB_ENCRYPTION_KEY`, applied on every store and decrypted only at point of use. Correct pattern.
- **Proactive token refresh**: `token-manager.ts:56-67` + `lib/connections/providers.ts:67-120` refresh before expiry (300s/60s thresholds) and distinguish "reauth required" from "permission revoked" via `isRevocationError`. Solid.
- **OAuth CSRF (Connection Hub)**: PKCE + signed state cookie, validated on callback. Correct.
- **Secrets hygiene**: no hardcoded API keys/secrets found anywhere in source; all credentials load via `process.env` with explicit throw-if-unset guards at their respective call sites.
- **Presigned upload flow**: `lib/storage/signed-url.ts` — file bytes never transit the Next.js server, reducing the attack surface (no server-side file parsing of untrusted uploads in the request path itself).
- **Centralized API error shape**: `lib/api/errors.ts` + `lib/api/error-handler.ts` normalize errors into a consistent `{ error: { code, message } }` shape, which avoids leaking stack traces/internal details — though note `app/api/documents/upload/route.ts` bypasses `handleApiError` with manual `NextResponse.json` calls; make that consistent.

## 3.10 Pre-launch security action list

1. Fix Connection Hub IDOR (§3.2) — **blocker**
2. Add security headers (§3.3) — **blocker**
3. Wire audit logging for sensitive mutations (§3.5) — **blocker**
4. Add per-endpoint rate limiters for auth/OAuth-callback/upload (§3.4) — **blocker**
5. Add `lib/env.ts` boot-time validation (§3.8) — high priority, low effort
6. Verify better-auth cookie/session config (`sameSite`, session TTL, rotation-on-privilege-change) explicitly rather than trusting defaults (§3.6)
7. Decide and document RBAC enforcement scope for launch (§3.7)
8. Run a dependency vulnerability scan (`npm audit` / Snyk / GitHub Dependabot alerts — not verified as configured; add to CI per [05](./05-launch-checklist.md))
9. Commission a focused external pentest or `/code-review ultra` security pass on the Connection Hub + auth flows specifically, post-fix, before opening public registration

See [06 — Risk Assessment](./06-risk-assessment.md) for these framed as failure modes with likelihood/impact, and [05 — Launch Checklist](./05-launch-checklist.md) for the security section of the go-live punch list.
