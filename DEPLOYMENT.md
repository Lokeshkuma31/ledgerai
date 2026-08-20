# Deployment — Quick Reference

Full deployment architecture, rollback procedures, and disaster recovery live in
[`docs/production-readiness-v2/`](./docs/production-readiness-v2/README.md). This file is the fast-path summary for someone about to deploy or roll back right now.

## Environments

| Environment | Trigger | Database |
|---|---|---|
| Development | `npm run dev` locally | Neon dev branch / local |
| Preview | any PR push | Neon branch-per-PR (recommended) |
| Production | merge to `master`, after CI is green | Neon `main` branch |

## Pipelines

- **`.github/workflows/ci.yml`** — runs on every PR: typecheck, lint, unit tests, Prisma migration drift check, build, dependency audit (critical-blocking, high-informational). Must be green before merge.
- **`.github/workflows/deploy-production.yml`** — runs on merge to `master`: same quality gates, then `prisma migrate deploy` against the production DB (unpooled connection), then `vercel build`/`vercel deploy --prod`, then a post-deploy `/api/health` check.

### Required GitHub secrets

| Secret | Purpose |
|---|---|
| `VERCEL_TOKEN` | Auth for `vercel pull`/`build`/`deploy` in CD |
| `PROD_DIRECT_DATABASE_URL` | Unpooled Neon connection for `prisma migrate deploy` in production |
| `PREVIEW_DATABASE_URL` / `PREVIEW_DIRECT_DATABASE_URL` | Ephemeral/preview Neon connection for the CI migration-diff check, build, and e2e job |
| `PREVIEW_BETTER_AUTH_SECRET` | Auth secret for the e2e job's signup flow against the preview database |

Vercel project/org linkage comes from `.vercel/project.json` (already committed) — `vercel pull` uses `VERCEL_TOKEN` plus that file to resolve the right project without additional secrets.

## Rollback

**App-only (no migration involved) — the common case:**
```
vercel rollback <previous-deployment-url> --token=$VERCEL_TOKEN
```
Or promote the prior deployment from the Vercel dashboard. Takes effect in seconds.

**Migration involved:** see [`06-operational-runbook.md`](./docs/production-readiness-v2/06-operational-runbook.md#runbook-rollback) — short version: prefer expand/contract migrations so app rollback alone fixes most incidents; only fall back to a paired `down` migration or a Neon PITR restore if the migration was destructive.

## Full docs

- [Deployment Architecture](./docs/production-readiness-v2/02-deployment-architecture.md)
- [Operational Runbook](./docs/production-readiness-v2/06-operational-runbook.md)
- [Disaster Recovery Plan](./docs/production-readiness-v2/07-disaster-recovery-plan.md)
