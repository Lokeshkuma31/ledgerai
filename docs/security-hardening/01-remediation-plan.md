# Security Remediation Plan

**Scope:** eliminate the security/operational blockers identified in the production-readiness audit ([docs/production-readiness/03-security-review.md](../production-readiness/03-security-review.md)) so the app is safe to wire real background jobs and real provider integrations against. No new product features, no UI redesign. Grounded in a fresh, systematic re-read of every Server Action and Route Handler in the codebase (5 Route Handlers, 2 files exporting Server Actions — full inventory in [02-authorization-audit.md](./02-authorization-audit.md)).

## Priority sequencing and rationale

Order matters because later priorities either depend on earlier ones or compound their risk if done out of order:

| Priority | Work | Why this order |
|---|---|---|
| P1 | Authorization / IDOR | The confirmed IDOR (§ below) allows one user to mutate another user's OAuth connection today. This is exploitable *right now*, independent of anything else — fixing it first also gives Priority 4 (audit logging) a correct ownership model to log against, rather than logging actions that shouldn't have been allowed in the first place. |
| P2 | Security headers | Cheap, isolated, no dependency on other work. Closes defense-in-depth gaps (clickjacking, MIME-sniffing, XSS blast radius) that compound the risk of P1 if done last. |
| P3 | Rate limiting | Needs P1's ownership model in place first for the Server-Action limiters to key correctly by authenticated user rather than an anonymous identifier. |
| P4 | Audit logging | Deliberately after P1 — logging "who did what to which resource" is only meaningful once "which resource" is authorization-checked. Also needs a stable event taxonomy, defined here before code is written. |
| P5 | Health/readiness/liveness | Independent of P1-P4; ordered last only because it's purely additive (new endpoints, touches nothing else) and lowest risk — could be parallelized, but sequenced last so it can incorporate a job-queue status check informed by the audit-logging work's shape. |

## Risk assessment per priority

| Priority | Current risk if unaddressed | Residual risk after fix |
|---|---|---|
| P1 (IDOR) | **Critical.** Any authenticated user can disconnect, rename, or force-refresh another user's Gmail/Outlook/Yahoo connection by ID — no guessing protection beyond UUID opacity, and IDs can leak via logs, screenshots, referrer headers, or a future admin surface. | Low — ownership is enforced at the one chokepoint (`lib/connections/engine.ts`) every caller already goes through. |
| P2 (headers) | **High.** No CSP means a single missed sanitization anywhere in the app (AI Coach output rendering, document metadata, future rich text) is directly exploitable as stored/reflected XSS with no second layer of defense. No X-Frame-Options means clickjacking against destructive actions (disconnect, delete). | Low-Medium — headers are defense-in-depth, not a substitute for input handling discipline, which is unchanged by this work. |
| P3 (rate limiting) | **High.** Auth endpoints (`/api/auth/*`) are explicitly excluded from the one existing rate limiter and rely on unverified better-auth internal throttling. **Newly confirmed in this pass: Server Actions never hit `/api/*`, so `middleware.ts`'s `needsRateLimit()` check never applies to them at all** — the four Connection Hub Server Actions currently have *zero* rate limiting, not even the generic one. | Low — every sensitive surface gets an explicit, independently-enforced limiter. |
| P4 (audit logging) | **High.** `AuditLog` is a fully-designed Prisma model with zero writers. No forensic trail exists for any security-relevant event today. | Low — the security-relevant event set is covered; general business-event auditing (e.g., transaction edits) is out of scope for this pass. |
| P5 (health endpoints) | **Medium.** No way to detect an outage except user complaints; no automated readiness signal for deploy gating. | Low — visibility exists; doesn't reduce likelihood of failures, only detection time. |

## Estimated effort

| Priority | Effort | Notes |
|---|---|---|
| P1 | Small (half day) | Touches 3 files (`engine.ts`, `actions.ts`, one test file) plus a new small shared utility |
| P2 | Small (few hours) | One file (`middleware.ts`), plus a manual verification pass in a browser to confirm nothing breaks |
| P3 | Small-Medium (half to full day) | New named limiters in `lib/cache/redis.ts`, wired into 5 call sites (auth handler wrapper, authorize route, callback route, upload route, 4 Server Actions) |
| P4 | Medium (full day) | New repository + service layer, ~8-10 call sites instrumented across auth hooks, connection engine, and error paths |
| P5 | Small-Medium (half day) | 3 new route handlers, each doing a handful of lightweight dependency checks |

Total: roughly 3-4 engineer-days, sequenced as a single continuous pass since each priority is small enough not to warrant separate review cycles, but each is independently revertable (isolated to its own files) if a problem surfaces.

## Non-goals (explicitly out of scope for this pass)

- Real provider connectors (Gmail/Graph/Yahoo mail sync, account aggregator, OCR) — tracked separately in the production-readiness Launch Checklist
- Inngest wiring / background job execution — this pass hardens the app *for* that work, it doesn't do it
- RBAC enforcement of `Membership.role` beyond what P1 requires — flagged as a separate, explicit scope decision in the original security review
- CSRF token infrastructure beyond what Connection Hub OAuth already has — same-site cookie behavior is treated as adequate for this pass; a full app-wide CSRF token scheme is not built here
- UI/UX changes of any kind — every fix in this plan is designed to be invisible to a user clicking through the app correctly; only unauthorized/malformed requests should see different behavior

See [02 — Authorization Audit](./02-authorization-audit.md) for the full endpoint-by-endpoint review, [03 — IDOR Verification Report](./03-idor-verification-report.md) for the confirmed finding, and [04](./04-security-header-strategy.md)/[05](./05-rate-limiting-strategy.md)/[06](./06-audit-logging-design.md) for the P2/P3/P4 designs.
