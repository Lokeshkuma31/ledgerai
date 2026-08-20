# 08 — Launch Checklist

Organized by domain. ✅ = already true today per codebase inspection. ⬜ = action required before go-live.

## Engineering / Quality Gates
- ✅ CI pipeline (`.github/workflows/ci.yml`) added — typecheck, lint, test, build, migrate-diff, `npm audit`. Needs `PREVIEW_DATABASE_URL`/`PREVIEW_DIRECT_DATABASE_URL` and `VERCEL_TOKEN` GitHub secrets set before it can run end to end (⬜)
- ✅ CD pipeline (`.github/workflows/deploy-production.yml`) added — needs `PROD_DIRECT_DATABASE_URL` + `VERCEL_TOKEN` secrets set, then one successful run (⬜)
- ✅ Unit test suite exists and passes (68 Vitest files, 498 tests)
- ✅ One e2e test covering sign-up → dashboard shipped (`e2e/golden-path.spec.ts`, Playwright, `npm run test:e2e`) — verified passing locally against the real dev DB; the `e2e` CI job needs `PREVIEW_DATABASE_URL`/`PREVIEW_BETTER_AUTH_SECRET` secrets before it runs in CI. Coverage stops at dashboard load — connect-account and provider-sync flows are not yet covered (⬜, fast-follow once real provider sync ships)
- ✅ `tsc --noEmit` added as `npm run typecheck`, zero errors (6 pre-existing errors in `lib/observability/__tests__/tracing.test.ts` fixed to get here)
- ✅ Zero critical `npm audit` findings; 3 high-severity findings (transitive via `next@^15`) tracked as an accepted-risk exception in [04](./04-security-verification-report.md) — CI surfaces them as a non-blocking warning

## Performance
- ⬜ Core Web Vitals baseline captured (see [05](./05-performance-verification-report.md))
- ⬜ One synthetic load test executed against staging/preview
- ⬜ Database index audit completed for top hot queries
- ⬜ Bundle size measured and within budget

## Accessibility
- 🟡 Lightweight code-level WCAG AA pass done (2026-08-06): global `prefers-reduced-motion` rule added, light-mode `--foreground-subtle` contrast fixed (~2.4:1 → ~7:1), icon-only buttons in `RecentSearches.tsx` given `aria-label`s, sidebar given a `navigation` landmark role. This was a targeted pass, not a full audit — ⬜ a real audit (screen reader pass, full keyboard-nav walkthrough, automated tool like axe/Lighthouse against a running instance) is still needed before launch
- ⬜ Sign-in / sign-up flow specifically audited (highest-traffic unauthenticated surface) — labels/focus rings confirmed present, not yet screen-reader-tested

## Legal
- ✅ Privacy Policy page published (`/legal/privacy`) — **draft, marked pending legal review**
- ✅ Terms of Service page published (`/legal/terms`) — **draft, marked pending legal review**
- ✅ Cookie Policy page published (`/legal/cookies`) — **draft, marked pending legal review**
- ✅ Security Policy page published (`/legal/security`) — **draft, marked pending legal review**
- ✅ Responsible Disclosure page published (`/legal/responsible-disclosure`) — **draft, marked pending legal review**
- ⬜ Data export capability for users (GDPR-readiness — even a manual/support-mediated process is acceptable for launch; the new Support form can serve this as an interim path, full self-serve export can be a fast-follow)
- ⬜ Account deletion capability (self-serve or support-mediated — same interim path via Support form)
- ⬜ Consent management for analytics cookies (banner or equivalent, jurisdiction-appropriate) — noted as outstanding directly on the Cookie Policy page
- **Note**: legal copy itself requires human legal review before publishing — every page above carries a visible "draft, pending legal review" banner and must not go live without that review removing it.

## Observability
- ✅ Sentry wired (server + edge + client)
- ✅ OpenTelemetry tracing wired
- ✅ Pino structured logging wired
- ✅ PostHog analytics wired (partial event coverage — acceptable for launch, expand post-launch)
- ✅ Health endpoint exists (`/api/health` per observability platform)
- ⬜ Sentry alert rules configured and routed to a real channel
- ⬜ Log retention/sink confirmed adequate for incident investigation

## Backups / Disaster Recovery
- ⬜ Neon PITR confirmed enabled, retention window adequate
- ⬜ One DB restore rehearsed and timed
- ⬜ R2 bucket versioning enabled and one restore rehearsed
- ⬜ Env var source-of-truth list documented outside Vercel

## Deployment
- ⬜ `vercel.ts` committed
- ⬜ Rollback rehearsed at least once in a non-production environment
- ⬜ Expand/contract migration policy documented and followed for any pending schema work
- ⬜ Custom domain attached, SSL confirmed active, DNS verified

## Monitoring
- ✅ Admin console for jobs + observability exists (`app/(admin)/*`)
- ⬜ Dead-letter queue alerting connected to a real notification channel
- ⬜ High-error-rate alert threshold defined

## Documentation
- ✅ Extensive design docs exist (`docs/observability/`, `docs/security-hardening/`, `docs/job-platform/`, `docs/provider-integration/`)
- ⬜ This production-readiness doc set finalized and linked from repo root README
- ⬜ `DEPLOYMENT.md` quick-reference added at repo root
- ⬜ API documentation for any externally-facing endpoints (internal-only APIs can skip this)

## Support
- ✅ Feedback/bug-report mechanism in-app — Settings → Support tab, `components/settings/SupportSettings.tsx` / `lib/support/actions.ts`; persisted via the existing `AuditLog` model + Pino, no new infrastructure
- ⬜ Support contact published (email or equivalent) — referenced as "to be added" on the Responsible Disclosure page, needs a real address before launch
- ✅ Diagnostic/system-info display for support triage — "Copy diagnostic info" button (page URL, user agent, viewport, timestamp) ships with every feedback submission and standalone in Settings → Support

## Feature Flags / Rollout Safety
- ✅ Env-var-driven kill switch for provider sync shipped — `lib/flags.ts`'s `isProviderSyncEnabled()`, gated at both the real (Inngest `syncStart`/`syncRun`) and legacy (`lib/sync/engine.ts`, `lib/banks/sync-engine.ts`) sync entry points, with a UI banner in `SyncDashboard`. Set `NEXT_PUBLIC_PROVIDER_SYNC_ENABLED=false` to disable instantly, no redeploy needed beyond the env var change
- ⬜ Rollout plan for controlled beta vs. general availability documented (see [10](./10-30-day-operations-plan.md))

## Scope Decision Required (not an engineering gap — a product call)
- ⬜ **Decide and document**: does launch include provider sync as "demo/mock data, clearly labeled" or is it flagged off entirely until real providers ship? This is called out three times across this doc set because it is the one item that isn't purely execution — it needs a decision from the product owner.

## Sign-off

This checklist feeds directly into [09 — Go-Live Approval Report](./09-go-live-approval-report.md). Every ⬜ above must be checked before that report can be signed.
