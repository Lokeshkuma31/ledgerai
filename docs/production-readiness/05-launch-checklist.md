# 5. Launch Checklist

Organized by domain, as specified. Each item is marked with current status based on direct code inspection: ✅ done, 🟡 partial, ⬜ not started. This checklist is the operational punch list — see [07](./07-production-readiness-report.md) for the phased sequencing of this work and [06](./06-risk-assessment.md) for why each blocker matters.

## Infrastructure
- ⬜ `vercel.ts` (or `vercel.json`) committed with explicit build/framework config
- ⬜ Separate Neon branches for dev / preview (branch-per-PR) / production
- ⬜ Separate Upstash Redis databases per environment, with key-prefixing if a preview DB is shared
- ⬜ Separate R2 buckets per environment (`ledgerai-dev` / `-preview` / `-prod`)
- ⬜ Inngest environments provisioned (dev / branch / production) and `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` set per environment
- ⬜ `lib/env.ts` — Zod-validated environment schema, fails fast at boot
- ⬜ `postinstall` script running `prisma generate` (custom output path `src/generated/prisma` currently requires a manual step)
- ⬜ Custom domain attached, TLS verified, `BETTER_AUTH_URL` and OAuth redirect URIs updated to final domain
- ⬜ Vercel CLI installed locally for the team (`npm i -g vercel`) and `vercel env pull` workflow documented

## Authentication
- ✅ Email/password sign-in (better-auth, `lib/auth/better-auth.ts`)
- ✅ Google sign-in (better-auth social provider)
- ⬜ Microsoft sign-in (identity) — not implemented; only Connection Hub's Microsoft OAuth exists, and that's for data-source connection, not login
- ⬜ Yahoo sign-in (identity) — same gap
- 🟡 Session management — real (server-validated via `auth.api.getSession`), but session rotation/refresh policy not explicitly reviewed against defaults (see [03 §3.6](./03-security-review.md#36-medium-no-general-csrf-token-scheme))
- ⬜ Rate limiting on login/password-reset endpoints specifically (currently relies on unverified better-auth internal throttling)
- ⬜ Account lockout / brute-force protection policy defined and implemented

## Connections (OAuth data-source layer)
- ✅ Google Connection Hub OAuth (PKCE, real endpoints, token encryption, proactive refresh)
- ✅ Microsoft Connection Hub OAuth (identity scope, real endpoints)
- ✅ Yahoo Connection Hub OAuth (identity scope, real endpoints)
- ✅ AES-256-GCM token encryption at rest
- ⬜ **Fix IDOR**: disconnect/refresh/rename Server Actions don't verify connection ownership ([03 §3.2](./03-security-review.md#32-critical-idor-in-connection-hub-server-actions)) — **blocker**
- ⬜ Connection Hub "list connections" as a proper API route (currently implicit via server-rendered page only)
- ⬜ Sync-trigger route/action — does not exist at all today

## Sync & background jobs
- ⬜ Inngest wired at all (`app/api/inngest` route, client instantiation) — currently zero wiring despite the dependency being installed — **blocker**
- ⬜ Email sync job (incremental, paginated, rate-limited) — **blocker for stated launch scope**
- ⬜ Merchant normalization job
- ⬜ Forecasting job
- ⬜ Recurring-detection job
- ⬜ Summary-generation job
- ⬜ Feed-refresh job
- ⬜ Retry logic with exponential backoff (only ad hoc `retryCount` fields exist today, no shared backoff utility)
- ⬜ Dead-letter queue — entirely absent
- 🟡 In-memory sync/workflow/feed engines exist (`lib/sync`, `lib/workflows`, `lib/feed`) but are not durable and not reachable from any API route — candidates to be reused as Inngest step logic, not thrown away

## Real connectors
- ⬜ Gmail API integration (real OAuth-token-authenticated calls, pagination via `nextPageToken`, incremental sync via `historyId`, attachment download) — currently 17 hardcoded fixtures — **blocker**
- ⬜ Microsoft Graph mail integration (`/me/messages`, `/me/mailFolders`) — currently identity-only OAuth, no mail calls — **blocker**
- ⬜ Yahoo Mail integration — currently identity-only; note Yahoo Mail API access requires separate partner approval (flagged in the code itself) — plan lead time for this application
- ⬜ Real account aggregator provider (currently `AccountAggregatorConnector` explicitly named "(Mock)" in code)
- ⬜ Real OCR/document-intelligence provider (currently `MockOCRProvider`, static text lookup)
- 🟡 Android SMS ingestion — real parsing/normalization/dedup pipeline exists, but the only data source is a browser `localStorage` demo; no device bridge or API route for real SMS ingestion exists

## Security
- ⬜ Security response headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) — **blocker**
- ⬜ Per-endpoint rate limiters (auth, OAuth callback, upload, AI chat) beyond the single generic limiter — **blocker**
- ⬜ Audit logging wired to real mutation paths (schema exists, zero writes today) — **blocker**
- ⬜ Fix Connection Hub IDOR (see Connections section above) — **blocker**
- ⬜ RBAC enforcement decision + implementation for `Membership.role`, or explicit documented scope-out for single-user-per-org launch
- ✅ No hardcoded secrets in source (verified clean)
- ⬜ `npm audit` / Dependabot / Snyk configured in CI
- ⬜ Focused security review of auth + Connection Hub flows after the above fixes land

## Performance
- ⬜ Verify/add GIN indexes on `Transaction.searchVector` / `Merchant.searchVector`
- ⬜ Add missing `Transaction` composite index (`organizationId + merchantId`) and category-column index
- ⬜ Bundle analysis pass; confirm `html2canvas`/`jspdf`/`recharts` are dynamically imported where not on the critical path
- ⬜ `loading.tsx` streaming boundaries on data-heavy routes
- ⬜ Load testing — **after** real connectors land, not before (see [04 §4.7](./04-performance-audit.md#47-performance-testing))
- ✅ Serverless-safe Prisma singleton via Neon adapter

## Monitoring / Observability
- ⬜ Sentry configured (client/server/edge configs, DSN, `captureException` wired into `handleApiError`/`handleActionError`) — currently zero config files despite the dependency — **blocker**
- ⬜ OpenTelemetry SDK setup, request tracing — not even a dependency yet, despite being a stated requirement
- ⬜ PostHog initialized (client + server) and key events instrumented — currently zero initialization — **blocker**
- ⬜ Pino structured logger replacing the current 2 `console.error` call sites, with request-ID propagation
- ⬜ `/api/health` endpoint (DB, Redis, R2, OAuth reachability, job-queue status) — entirely absent — **blocker**
- ⬜ React error boundaries (`error.tsx`, `global-error.tsx`) — entirely absent anywhere under `app/`
- 🟡 Centralized API error handling exists (`lib/api/errors.ts`, `lib/api/error-handler.ts`) but isn't used consistently (`documents/upload` route bypasses it)

## Backups & disaster recovery
- ⬜ Neon point-in-time recovery window confirmed and documented (Neon supports PITR — confirm plan tier and retention window)
- ⬜ R2 bucket versioning/lifecycle policy decided (accidental deletion / overwrite protection for uploaded documents)
- ⬜ Documented recovery runbook: what to do if Neon primary is unavailable, if Upstash is unavailable, if R2 is unavailable — none exists today
- ⬜ Backup restore drill performed at least once before launch (untested backups are not backups)

## Testing
- 🟡 52 vitest files exist; mix of unit tests and genuine integration tests against a real Neon database (`services/transactions/__tests__/transaction-service.test.ts` explicitly hits live Postgres) — good foundation
- ⬜ No coverage reporting configured (`vitest.config.ts` has no `coverage` block)
- ⬜ No end-to-end tests (no Playwright/Cypress) — auth flows, OAuth flows, CRUD flows, permission flows are untested end-to-end
- ⬜ No accessibility testing (no axe/jest-axe)
- ⬜ No load/performance testing
- ⬜ No cross-browser or mobile testing process defined
- ⬜ CI doesn't exist yet to even run the 52 tests automatically (see Infrastructure/CI-CD)

## CI/CD
- ⬜ No `.github/workflows` directory exists at all — **blocker**
- ⬜ Typecheck + lint + vitest workflow on PRs
- ⬜ `prisma migrate diff` safety check on PRs touching the schema
- ⬜ Preview deployment workflow (Vercel's native GitHub integration can cover this, but OAuth-per-preview needs the fix described in [02 §2.2](./02-deployment-architecture.md#22-environment-separation-requirements))
- ⬜ Release workflow: `prisma migrate deploy` against production, gated behind an approval environment
- ⬜ Post-deploy smoke test hitting `/api/health`

## Documentation
- ⬜ Developer guide (README is currently unmodified `create-next-app` boilerplate)
- ⬜ Architecture guide (this document set is the start; needs to live somewhere discoverable post-launch, e.g., linked from README)
- ⬜ Deployment guide
- ⬜ OAuth setup guide (per-provider console steps — partially covered by comments in `.env.example`, needs to be a real doc)
- ⬜ Database guide (schema overview, migration workflow, branching strategy)
- ⬜ Troubleshooting guide
- ⬜ Operations runbook (incident response, on-call, escalation)

## Legal
- ⬜ Privacy policy — does not exist; **also blocks Google OAuth production verification**, which requires a privacy policy URL
- ⬜ Terms of service — does not exist
- ⬜ Cookie policy — does not exist
- ⬜ Data export flow (user-initiated) — does not exist
- ⬜ Data deletion flow (user-initiated, cascading through Transactions/Documents/Connections/AI memory) — does not exist
- ⬜ GDPR-readiness review (even if initial launch is US-only, decide and document the position)

## Accessibility
- 🟡 UI is built on `@base-ui/react`, which provides accessible-by-default unstyled primitives (similar to Radix) — a reasonable foundation, but this was not independently verified against WCAG AA criteria
- ⬜ No automated accessibility testing (no axe-core/jest-axe in the repo)
- ⬜ No manual WCAG AA audit performed or documented
- ⬜ No keyboard-navigation / screen-reader pass documented for key flows (onboarding, connection wizard, transaction review)

---
**Blockers** (must complete before public launch, independent of nice-to-haves): Connection Hub IDOR fix, security headers, per-endpoint rate limiting, audit logging wiring, Inngest wiring + email sync job, Sentry wiring, PostHog wiring, `/api/health`, CI pipeline, privacy policy (also an OAuth-verification dependency). See [07 — Production Readiness Report](./07-production-readiness-report.md) for how these sequence into phases.
