# Production Readiness Phase — Progress

**Status: in progress, picking back up later.** This is a live checklist, not a finished record — update it as you go rather than treating it as historical.

## Done and verified (code side — all typecheck/lint/test/build-clean)

- **CI/CD**: `.github/workflows/{ci.yml,deploy-production.yml,dependabot.yml}` added. Needs GitHub secrets before it runs end to end (see "Blocked on you" below).
- **Dependency audit**: `npm audit fix` applied (6/9 findings closed); 3 remaining high-severity findings (transitive via `next@^15`, need a major bump) tracked as an accepted-risk exception in [04](./04-security-verification-report.md), CI surfaces them as a non-blocking warning.
- **Feature flag kill switch**: `lib/flags.ts`'s `isProviderSyncEnabled()`, wired into both the real Inngest sync path (`lib/jobs/functions/sync.ts`) and the legacy client-side path (`lib/sync/engine.ts`, `lib/banks/sync-engine.ts`), with a UI banner in `SyncDashboard`. `NEXT_PUBLIC_PROVIDER_SYNC_ENABLED=false` disables instantly.
- **Legal pages**: `/legal/{privacy,terms,cookies,security,responsible-disclosure}` published as clearly-marked drafts, linked from sign-in.
- **Support/feedback**: Settings → Support tab (`components/settings/SupportSettings.tsx`, `lib/support/actions.ts`) — persists via existing `AuditLog` model + Pino, no new infra.
- **Accessibility (lightweight pass)**: global `prefers-reduced-motion` CSS rule, fixed a real light-mode contrast failure (~2.4:1 → ~7:1 on `--foreground-subtle`), labeled two icon-only buttons in `RecentSearches.tsx`, added a nav landmark to the sidebar. **Not** a full audit — screen reader + automated tooling pass still needed.
- **E2E coverage**: `e2e/golden-path.spec.ts` (Playwright) — sign-up → dashboard, passing locally against the real dev DB (took 8–45s due to dev-mode compile + remote Neon latency; see the performance report's first real data point). `npm run test:e2e`. Vitest explicitly excludes `e2e/**` to avoid picking up the Playwright spec.
- **Docs**: `DEPLOYMENT.md` + this `docs/production-readiness-v2/` set, all 10 deliverables plus this progress file.

## Blocked on you (external access / people, not more of my time)

- [ ] **GitHub secrets** (`github.com/Lokeshkuma31/ledgerai/settings/secrets/actions`): `VERCEL_TOKEN`, `PROD_DIRECT_DATABASE_URL`, `PREVIEW_DATABASE_URL`, `PREVIEW_DIRECT_DATABASE_URL`, `PREVIEW_BETTER_AUTH_SECRET` — nothing in CI/CD runs until these exist. This is the single highest-leverage next step.
- [ ] **Neon project access (was "account mismatch", now has a likely explanation)**: `neonctl` was installed and authenticated as `lokeshkuma31@gmail.com` — that account has **zero Neon projects** via standalone login. But `.env.local`'s `DATABASE_URL` points to a real project at host `ep-square-darkness-awle9fys...neon.tech`, project id `dawn-mud-65383980`. **Likely explanation**: the `.env.local` vars (`NEON_PROJECT_ID`, `NEON_AUTH_BASE_URL`, duplicated `PG*`/`POSTGRES_*` naming) match Vercel's auto-injected format for Neon provisioned *through Vercel's Storage/Marketplace integration* — not a standalone Neon email/password account. Two ways in: (1) Vercel dashboard → `ledgerai` project → Storage tab (no separate Neon login needed — likely also where PITR/retention settings live for a Vercel-provisioned DB); (2) neon.tech login → "Continue with Vercel" (federated, tied to whichever Vercel account owns team `team_LOEZefvMAz4uCmv4TzXcujCJ`). **Not yet confirmed** — user was going to check the Storage tab. Until confirmed, the Disaster Recovery Plan's PITR rehearsal ([07](./07-disaster-recovery-plan.md)) is stuck.
- [x] **Google OAuth** — confirmed out of testing mode (2026-08-06). ⚠️ Double-check whether the Better Auth app-login Google client and the Connection Hub's Gmail-sync Google client are the same registered app or two separate ones — only confirm both if separate.
- [ ] **Microsoft OAuth** (portal.azure.com) — still needs production redirect URIs + out of testing/sandbox mode.
- [ ] **Yahoo OAuth** (developer.yahoo.com/apps) — same.
- [ ] **Cloudflare R2 bucket versioning** — currently the only real restore mechanism for documents; confirm enabled (DR plan launch blocker).
- [ ] **Upstash Redis plan tier** — confirm production database, not a free/dev instance.
- [ ] **Inngest env keys** — confirm `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` in Vercel prod point to Inngest's production environment.
- [ ] **Sentry alert rules** — not yet configured, no real channel routed.
- [ ] **PostHog production key** — confirm prod project key is what's in Vercel, not dev.
- [ ] **Legal review** — a lawyer needs to review and clear the `/legal/*` drafts before the "pending review" banners come off.
- [ ] **Neon PITR retention window** — once the account question above is resolved: Launch/Scale plans *default* to 1 day even though they allow up to 7/30 — this needs to be explicitly raised, not just checked.

## Not started

- Full accessibility audit (screen reader walkthrough, axe/Lighthouse against a running instance)
- Broader e2e coverage (connect-account, provider-sync flows) — natural fast-follow once real provider sync ships
- Performance baselines (Core Web Vitals, load test, query index audit) — see [05](./05-performance-verification-report.md)
- Analytics-cookie consent banner (flagged directly on `/legal/cookies`)
- Data export / account deletion self-serve flows (Support form is the interim path)

## Where to resume

Start with the GitHub secrets — everything CI/CD-shaped is blocked on it. In parallel, resolve the Neon account-ownership question since it blocks the DR rehearsal independently. Everything else in "Blocked on you" can happen in any order.
