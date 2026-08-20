# 04 — Security Verification Report

## Current State (confirmed by inspection)

| Control | Status | Evidence |
|---|---|---|
| Authentication | Real — Better Auth, email/password + Google OAuth | `lib/auth/better-auth.ts` |
| Authorization / multi-tenancy | Real — org/membership scoping | `prisma/schema.prisma`, `lib/auth/better-auth.ts` databaseHooks |
| IDOR | One found, fixed and verified | `docs/security-hardening/02-authorization-audit.md`, `03-idor-verification-report.md`, fix in `lib/connections/engine.ts` |
| Rate limiting | Real — general + named limiters (auth/oauth-callback/upload/connection-mutation) | `lib/cache/redis.ts`, wired in `middleware.ts` |
| Security headers | Real — CSP, HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP | `middleware.ts` |
| Token encryption | Real — AES-256-GCM, PKCE for OAuth | `lib/connections/`, `CONNECTION_HUB_ENCRYPTION_KEY` |
| Audit logging | Real | `lib/audit/log.ts`, `AuditLog` model |
| CSRF | **Not independently verified** — relies on Better Auth defaults + SameSite cookies | No dedicated CSRF middleware found |

## Gaps and Required Actions

### 1. CSRF — verify, don't assume
Better Auth ships CSRF protection via origin/host checking on state-changing routes by default, and cookies should be `SameSite=Lax` or stricter. **Action**: explicitly confirm Better Auth's CSRF config is enabled (check `lib/auth/better-auth.ts` for `advanced.disableCSRFCheck` or equivalent — should be absent/false), and confirm all Server Actions that mutate state are POST-only (Server Actions are POST by default, but double-check no state mutation happens via a GET route handler in `app/api/`).

### 2. CSP allows `unsafe-inline` for scripts
Documented tradeoff for RSC hydration. **Action**: this is acceptable for launch given Next.js's hydration requirements, but track it as tech debt — consider a nonce-based CSP (`next.config.ts` + middleware nonce injection) as a fast-follow to close the XSS blast-radius gap. Not a launch blocker.

### 3. Dependency / supply-chain audit — run 2026-08-06, now gated in CI
`npm audit --production` was run and `npm audit fix` (non-breaking) applied, closing 6 of 9 findings (moderate/high in `@hono/node-server`, `brace-expansion`, `fast-uri`, `hono`, `ip-address`). **3 high-severity findings remain, all transitive through `next@^15`** (`postcss` XSS/path-traversal advisories, `sharp` libvips CVEs) — the only fix is `npm audit fix --force`, which bumps to `next@16.3.0`, a breaking major-version change. Per `AGENTS.md` this repo runs a customized, breaking-change Next.js build, so an unreviewed major bump is out of scope for this operational-readiness pass.

**Accepted-risk exception**: tracked here, not silently ignored. `.github/workflows/ci.yml` and `deploy-production.yml` hard-block on `--audit-level=critical` (currently clean) and surface `--audit-level=high` as a non-blocking CI warning, so the finding stays visible on every PR rather than being buried. **Owner: whoever plans the Next.js major-version upgrade — revisit at that time, not before.** Both `postcss` (CSS build-time XSS/path-traversal) and `sharp` (image-processing libvips CVEs) require local/malicious input to the build or an image-processing pipeline respectively — neither is remotely exploitable via normal request traffic in this app's current usage, which is why this is a launch-acceptable exception rather than a blocker.

Recommended fast-follow: add Dependabot config (`.github/dependabot.yml`) for ongoing supply-chain monitoring post-launch, not just this one-time scan.

### 4. Secret scanning
**Action**: add a pre-commit/CI secret-scanning step (e.g., `gitleaks` or GitHub's built-in secret scanning if the repo is on GitHub) to catch accidental `.env.local` commits or hardcoded keys before merge. No evidence of a prior leak, but no prevention control exists today either.

### 5. Encryption key rotation plan
`CONNECTION_HUB_ENCRYPTION_KEY` encrypts every stored OAuth token. There is no rotation procedure. **Action**: document (even if not executed pre-launch) a re-encryption migration path — decrypt with old key, re-encrypt with new key, versioned key ID stored alongside ciphertext — so rotation is possible without a data-loss incident later. Low urgency pre-launch, high urgency to have *documented* before the key has been live long enough that "we've never rotated this" becomes a compliance question.

### 6. OAuth app production status
Google/Microsoft/Yahoo OAuth apps must be out of "testing"/sandbox mode before public launch (Google caps testing-mode apps at 100 test users and shows an "unverified app" warning). **Action**: verify in each provider console — this is an infrastructure verification item cross-referenced from [03](./03-infrastructure-verification-report.md).

### 7. Rate limit coverage on unauthenticated routes
Confirm the general `apiRateLimit` genuinely covers all unauthenticated entry points (sign-up, OAuth callback, password reset if it exists) — these are the routes most attractive to abuse since they don't require a session. Spot-check `middleware.ts`'s exclusion list to ensure `/api/auth` isn't excluded from *all* limiting, only from the general limiter in favor of its own auth-specific limiter (per the code comment already found — confirm this is actually true, don't just trust the comment).

## What does NOT need work

Authentication, authorization, IDOR remediation, rate limiting, security headers, and token encryption are already production-grade. Do not re-litigate or rebuild these — the security-hardening pass (`docs/security-hardening/`) already did this work correctly. This report's job is to close the remaining verification gaps, not redo finished work.

## Success Criteria

- [ ] CSRF posture explicitly confirmed (not assumed) and documented
- [ ] `npm audit` / Dependabot scan run with zero critical/high findings, or documented exceptions with owner + due date
- [ ] Secret scanning added to CI
- [ ] Key rotation procedure documented (execution optional pre-launch)
- [ ] All three OAuth apps confirmed production/verified status
- [ ] Rate limit exclusion list manually verified against `middleware.ts`

## Timeline

2 days, runs in parallel with [03](./03-infrastructure-verification-report.md). Blocked on Phase 1 CI existing (so the audit gates become permanent, not one-off).
