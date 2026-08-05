# 7. Production Readiness Report — Executive Summary

**Verdict: not ready for public launch. Readiness is uneven — strong in a few load-bearing areas, largely unbuilt in most others required for a safe fintech launch.**

This is not a criticism of what's been built. The design system, analytics platform, and OAuth/token-encryption foundation are genuinely strong engineering. But "feature-complete" and "production-ready" are different axes, and this application has invested almost entirely in the first. The gap is now the critical path.

## 7.1 Readiness scorecard

| Domain | Readiness | Basis |
|---|---|---|
| UI / Design System / UX | 🟢 Strong | Built and polished per prior milestones (out of scope for this audit to re-verify, but not in question) |
| Data model & connection pooling | 🟢 Strong | 47-model Prisma schema, mostly well-indexed, serverless-safe Neon adapter singleton ([04](./04-performance-audit.md)) |
| OAuth mechanics (Connection Hub) | 🟢 Strong | Real PKCE flows, AES-256-GCM token encryption, proactive refresh — for all 3 providers ([03](./03-security-review.md)) |
| User authentication (sign-in) | 🟡 Partial | Email/password + Google real; Microsoft/Yahoo sign-in not implemented ([05](./05-launch-checklist.md#authentication)) |
| Real data connectors (email, aggregator, OCR) | 🔴 Not started | Gmail/Graph/Yahoo mail, account aggregator, and document OCR are all mock/fixture implementations behind real-looking interfaces ([05](./05-launch-checklist.md#real-connectors)) |
| Background jobs (Inngest) | 🔴 Not started | Dependency installed, zero wiring anywhere; well-designed in-memory engines exist but aren't durable and aren't reachable from any route ([01](./01-production-architecture.md)) |
| Security hardening | 🔴 Weak | No security headers, single generic rate limiter, unused audit-log model, one confirmed IDOR ([03](./03-security-review.md)) |
| Observability (Sentry/OTel/PostHog/logging) | 🔴 Not started | All four dependencies/requirements installed or stated; zero wiring; logging is two `console.error` calls; no health endpoint; no error boundaries ([05](./05-launch-checklist.md#monitoring--observability)) |
| CI/CD | 🔴 Not started | No `.github/` directory exists at all |
| Testing | 🟡 Partial | 52 vitest files including genuine DB-integration tests — a real foundation; zero e2e, zero accessibility, zero load testing |
| Legal / privacy | 🔴 Not started | No privacy policy, terms, or cookie policy — this also **blocks Google OAuth production verification** |
| Accessibility | 🟡 Unverified | Built on accessible-by-default primitives (`@base-ui/react`), but no WCAG AA validation performed |
| Documentation | 🔴 Minimal | Only design/migration specs exist; README is unmodified boilerplate; no architecture/deployment/ops docs prior to this document set |

## 7.2 The one insight that reframes the whole assessment

Five capabilities the launch requirements explicitly name — background jobs, error tracking, distributed tracing, product analytics, structured logging — are all **listed dependencies in `package.json` with zero call sites in the codebase**. This matters because it's easy, when reviewing a `package.json`, to read "inngest, sentry, posthog, pino are all here" as "these are handled." They are not. Confirming this gap was the single highest-value output of this audit, because it changes the shape of the remaining work from "wire up configuration" (a few hours each) to "design and implement the actual integration" (real engineering work, sequenced against the connector and security work that depends on it).

## 7.3 Phased path to launch

Sequencing matters — several fixes unblock or de-risk others. Recommended phases, each independently shippable to a staging environment:

**Phase 0 — Foundations (unblocks everything else)**
- `lib/env.ts` schema validation
- CI pipeline (typecheck/lint/test on PRs)
- Wire Sentry (client/server/edge configs)
- Wire `/api/health`
- Add security response headers

**Phase 1 — Close the critical security gaps**
- Fix Connection Hub IDOR
- Per-endpoint rate limiting (auth, OAuth callback, upload)
- Wire audit logging to sensitive mutation paths
- Verify better-auth session/cookie configuration explicitly

**Phase 2 — Make background jobs real**
- Wire Inngest (`app/api/inngest`, client, first function)
- Port the existing in-memory sync/workflow/feed engine logic into Inngest functions with retry + DLQ
- This phase is a prerequisite for Phase 3 doing real, non-blocking sync

**Phase 3 — Real connectors**
- Gmail API (pagination, incremental sync via historyId, attachments, rate-limit backoff)
- Microsoft Graph mail
- Yahoo Mail (start partner-approval application in parallel, early — it has external lead time, see [06 R11](./06-risk-assessment.md))
- Real account aggregator and OCR providers
- Each connector ships behind Phase 2's job infrastructure, not inline in a request

**Phase 4 — Observability & performance completion**
- PostHog instrumentation
- OpenTelemetry tracing
- Pino structured logging replacing `console.error`
- Missing DB indexes, bundle analysis, load testing (after Phase 3 connectors exist — see [04 §4.7](./04-performance-audit.md#47-performance-testing))

**Phase 5 — Legal, accessibility, launch operations**
- Privacy policy, terms, cookie policy (also unblocks Google OAuth verification — start this early given external review time, ideally overlapping Phase 1-2)
- Data export/deletion flows
- WCAG AA audit (automated + manual)
- E2E test suite for auth/OAuth/CRUD/permissions flows
- Backup/restore drill
- Finalize [09 — Go-Live Plan](./09-go-live-plan.md) and [10 — Post-Launch Plan](./10-post-launch-plan.md)

Legal (privacy policy specifically) should start in parallel with Phase 1, not wait for Phase 5 — Google's OAuth verification process has its own review latency and is a hard external dependency for both sign-in and Connection Hub Google flows going to production.

## 7.4 What "ready" looks like

Launch readiness is reached when every 🔴 above is at minimum 🟡 with an explicit, documented scope decision (e.g., "Yahoo Mail sync ships in a fast-follow because of partner-approval lead time" is an acceptable, honest launch decision; "we forgot Yahoo doesn't have real sync" is not). The [Launch Checklist](./05-launch-checklist.md) is the item-level tracker for this; this report is the narrative and sequencing behind it.
