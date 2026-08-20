# 01 — Production Readiness Report

## Executive Summary

LedgerAI's application layer and production substrate are both real and largely sound. The gap to launch is operational: no CI/CD, no disaster recovery procedure, no legal pages, no feature-flag kill switch, and no e2e coverage of the golden path. Provider data sync (Gmail/Outlook/Yahoo/OCR/Account Aggregator) is architecturally real (OAuth, token encryption, connection lifecycle) but functionally mocked — this is the one item requiring a product decision, not just engineering time.

**Recommendation: No-go today. Go-live achievable in 10–15 working days** against the plan below, assuming provider sync launches as a fast-follow behind a feature flag rather than as a day-one requirement.

## Scorecard

| Domain | Status | Grade |
|---|---|---|
| Application data model / multi-tenancy | Real, migrated, tested | ✅ Ready |
| Auth (Better Auth, org provisioning) | Real | ✅ Ready |
| Connection OAuth + token encryption | Real (AES-256-GCM, PKCE) | ✅ Ready |
| Rate limiting / security headers / IDOR | Real, one IDOR found and fixed | ✅ Ready |
| Background jobs (Inngest) | Real, dead-letter + retry + idempotency | ✅ Ready |
| Observability (Sentry/OTel/Pino/PostHog) | Real, wired | ✅ Ready |
| Admin console (jobs, observability) | Real | ✅ Ready |
| **CI/CD** | Workflows added (`ci.yml`, `deploy-production.yml`, `dependabot.yml`); needs GitHub secrets configured + one live run | 🟡 Near-done |
| **Disaster recovery** | Documented; PITR/versioning rehearsal not yet executed | 🔴 Blocker |
| **Legal pages** | Published as clearly-marked drafts (`/legal/*`); needs human legal review | 🟡 Near-done |
| Provider data sync (real, not mock) | Mock data behind real OAuth; kill switch now exists (`lib/flags.ts`) | 🟡 Scope decision, mechanism ready |
| Feature flags | Env-var kill switch shipped for provider sync | ✅ Minimum met |
| E2E test coverage | One golden-path test shipped (sign-up → dashboard, Playwright); connect-account/sync flows not yet covered | 🟡 Minimum met, expand later |
| Accessibility audit | Lightweight code-level pass done (reduced-motion, contrast, icon labels, nav landmark); full audit (screen reader, automated tooling) not yet run | 🟡 Partial |
| Support/feedback mechanism | Shipped — Settings → Support | ✅ Ready |
| Onboarding UX | Implicit only (auto-provision, no guided flow) | 🟡 Nice-to-have, not blocking |

## Go/No-Go Decision Framework

A production deploy is authorized only when every 🔴 item above is closed and the [Go-Live Approval Report](./09-go-live-approval-report.md) checklist is fully signed. 🟡 items should be closed before **general availability** but can ship after a **controlled beta** provided:
- Provider sync is flagged off (or clearly labeled "mock/demo data" in UI) for beta users, OR limited to one real provider.
- Feature flags exist at minimum as an environment-variable kill switch (see [02](./02-deployment-architecture.md)) even before a full flag service is built.

## Phased Plan

**Phase 1 — CI/CD + Quality Gates (2–3 days)**
Add `.github/workflows/ci.yml` (typecheck, lint, test, build) and `.github/workflows/deploy.yml` (Prisma migrate validation + Vercel promote). Add `"typecheck": "tsc --noEmit"` to `package.json`. Blocks all further phases — nothing else is safely repeatable without this.

**Phase 2 — Security & Infra Verification (2 days)**
Run the audits in [03](./03-infrastructure-verification-report.md) and [04](./04-security-verification-report.md): confirm CSRF posture, run `npm audit`/Snyk, rotate any long-lived secrets, verify Neon PITR is enabled, verify Upstash/R2 production tier limits.

**Phase 3 — Disaster Recovery + Runbooks (2–3 days)**
Write and **execute once** the DB restore drill in [07](./07-disaster-recovery-plan.md). Write the runbooks in [06](./06-operational-runbook.md).

**Phase 4 — Legal, Accessibility, Feature Flags (3–4 days)**
Ship Privacy Policy / Terms / Cookie Policy pages (static content, legal review recommended before publishing — flag for the user, don't draft binding legal text unsupervised). Run a WCAG AA pass on the 18 authenticated routes. Add an environment-variable-driven feature flag for provider sync at minimum.

**Phase 5 — Go-Live Rehearsal (1–2 days)**
Execute the [Launch Checklist](./08-launch-checklist.md) end to end in a preview environment, then produce the [Go-Live Approval Report](./09-go-live-approval-report.md).

## Dependencies

- Phase 1 blocks Phases 2–5 (nothing is a repeatable, verifiable gate without CI).
- Legal page copy needs a human legal review pass — flagged as a hard dependency the assistant cannot self-approve.
- Real provider sync (if pulled into launch scope) is a separate, larger workstream — see `docs/provider-integration/` design docs — and is explicitly out of scope for this operational-readiness pass per the task brief ("do not add new financial features").
