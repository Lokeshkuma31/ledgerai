# 02 — Deployment Architecture

## Current State

Deployment is Vercel-linked (`.vercel/project.json`, project `ledgerai`) with zero-config Next.js 15 App Router builds. No `vercel.json`/`vercel.ts`, no Dockerfile, no CI/CD. Every push to any branch presumably triggers a Vercel preview build (default Git integration behavior), and `master` presumably auto-promotes to production — but this is **unverified** because no pipeline document or `vercel.ts` encodes it explicitly.

## Target Topology

```
Local dev ─▶ feature branch ─▶ PR ─▶ GitHub Actions CI ─▶ Vercel Preview Deployment
                                         │ (typecheck, lint, test, build,
                                         │  prisma migrate diff check)
                                         ▼
                                   PR review + preview URL smoke test
                                         │
                                         ▼
                                 merge to master ─▶ GitHub Actions CD
                                         │ (same gates + prisma migrate deploy
                                         │  against production DB, then promote)
                                         ▼
                                 Vercel Production Deployment
                                         │
                                         ▼
                            Post-deploy health check (see below)
                            Automatic rollback trigger if health check fails
```

### Environments

| Environment | Trigger | Database | Purpose |
|---|---|---|---|
| Development | local `npm run dev` | Neon dev branch (or local) | Iteration |
| Branch/Preview | any PR push | Neon branch-per-PR (Neon's native branching — instant copy-on-write of prod schema+data) | Isolated review, no shared-state bugs between PRs |
| Staging (optional, recommended before GA) | merge to `staging` branch | Neon `staging` branch, long-lived | Final smoke test with production-like data volume |
| Production | merge to `master` (after CI green) | Neon `main` branch | Live traffic |

**Recommendation**: use Neon's native database branching for Vercel Preview Deployments — create a Neon branch per PR (via the Neon Vercel integration or a CI step calling the Neon API) so preview deploys never touch production data and Prisma migrations can be validated against a real copy before merge.

## Vercel Configuration — `vercel.ts`

Per current Vercel guidance, `vercel.json` is being superseded by `vercel.ts` (via `@vercel/config`). Recommended config for this repo:

```ts
// vercel.ts
import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  buildCommand: 'npm run build',
  installCommand: 'npm ci',
  crons: [
    // if any scheduled Inngest-adjacent cleanup jobs need a cron trigger
  ],
};
```

Keep this minimal — most behavior (rewrites, headers) is already handled in `next.config.ts`/`middleware.ts`; don't duplicate security headers in both places.

## Rollback Procedure

Vercel retains every deployment as an immutable, independently-addressable artifact. Rollback is **instant re-promotion**, not a rebuild:

1. **Detect**: post-deploy health check (`/api/health`, already exists per observability platform) fails, or error rate spike in Sentry/PostHog exceeds threshold within 10 minutes of deploy.
2. **Roll back application code**: `vercel rollback <previous-deployment-url>` or promote the prior deployment via the Vercel dashboard — takes effect in seconds, no rebuild.
3. **Roll back database, if the deploy included a migration**: this is the hard case — see below.

### The migration rollback problem

Application code rollback is instant; a Prisma migration that already ran against production is not automatically reversed by rolling back the app. Policy:

- **Prefer expand/contract migrations.** Every schema change that could break the previous app version (dropped column, renamed field, changed NOT NULL) must ship as two deploys: (1) additive/nullable change, deployed and baked in, (2) cleanup migration, only after the old app version is confirmed fully rolled off.
- For migrations that must be atomic, write and test a paired `down` migration before merging, and document it in the PR. `prisma migrate diff` can generate the reverse SQL for review.
- **Never** run `prisma migrate deploy` as part of the app rollback path — only forward, gated by CI.

## Blue/Green Readiness

Vercel's model is closer to **immutable-deployment-with-instant-promotion** than classic blue/green load-balanced pools, but it satisfies the same goal:
- Every deployment is a distinct, addressable build (blue and green are just "current production alias" vs. "previous deployment").
- **Rolling Releases** (GA since June 2025) can be used for gradual canary rollout of a production promotion — route a percentage of traffic to the new deployment before 100% cutover. Recommended for the first few post-launch releases carrying schema changes.
- Combine with the feature-flag kill switch (see [01](./01-production-readiness-report.md)) for a second, application-level rollback lever that doesn't require a redeploy at all.

## Documentation Deliverable

This file plus a `DEPLOYMENT.md` at repo root (short, points here) satisfies the "documentation" requirement. Add a one-page laminated version to [06 — Operational Runbook](./06-operational-runbook.md)'s deploy runbook for on-call use.

## Success Criteria

- [ ] `vercel.ts` committed, framework/build/install commands explicit
- [ ] CI pipeline gates every deploy (see [06](./06-operational-runbook.md) for exact workflow YAML)
- [ ] One documented, executed rollback (app-only) in a preview environment
- [ ] One documented, executed expand/contract migration rollback rehearsal
- [ ] Neon branch-per-PR wired for preview deployments

## Timeline

2–3 days, blocked on Phase 1 (CI/CD) from [01](./01-production-readiness-report.md).
