# 06 — Operational Runbook

## CI/CD Pipeline (the actual missing piece)

No `.github/workflows/` directory exists today. This is the concrete spec to add.

### `.github/workflows/ci.yml` — runs on every PR

```yaml
name: CI
on:
  pull_request:
    branches: [master]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm run test -- --run
      - name: Prisma migrate diff check
        run: npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --exit-code
        env:
          DATABASE_URL: ${{ secrets.PREVIEW_DATABASE_URL }}
      - run: npm run build
        env:
          DATABASE_URL: ${{ secrets.PREVIEW_DATABASE_URL }}
      - name: npm audit
        run: npm audit --production --audit-level=high
```

Add `"typecheck": "tsc --noEmit"` to `package.json` scripts so this is runnable locally too, not just in CI.

**Known flaky test**: `services/merchants/__tests__/merchant-service.test.ts`'s `mergeMerchant` test is a real-Neon integration test that has occasionally exceeded Vitest's default 20s `testTimeout` under network latency — observed during CI setup, unrelated to any code change. If it becomes a recurring CI-flake source, raise its per-test timeout rather than retrying blindly.

### `.github/workflows/deploy-production.yml` — runs on merge to `master`

```yaml
name: Deploy Production
on:
  push:
    branches: [master]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm run test -- --run
      - name: Run production migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.PROD_DIRECT_DATABASE_URL }}
      - name: Deploy to Vercel (production)
        run: npx vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }}
      - name: Post-deploy health check
        run: |
          sleep 15
          curl -sf https://ledgerai.example.com/api/health || exit 1
```

**Critical ordering**: migrations run *before* the new deployment goes live, and use the unpooled `DIRECT_DATABASE_URL` per the existing `prisma.config.ts` convention (already documented in this repo as necessary — pooled connections silently swallow migration-table writes). If the health check fails, the deploy step already promoted — see the rollback runbook below to demote immediately.

### Branch/preview deploys
Vercel's native Git integration already handles preview deploys per-PR with zero extra config once the repo is connected — no separate workflow needed for that; `ci.yml` above just adds the quality gate *alongside* it.

---

## Runbook: Deployment

1. Merge PR to `master` (already passed `ci.yml`).
2. `deploy-production.yml` runs migrations, deploys, health-checks.
3. Watch Sentry error rate and `/api/health` for 15 minutes post-deploy.
4. If clean, close out. If not, go to Rollback runbook immediately.

## Runbook: Rollback

**Application-only rollback (no migration involved):**
1. `vercel rollback` to the previous production deployment, or promote it via the Vercel dashboard. Effect is near-instant.
2. Confirm `/api/health` and Sentry error rate return to baseline.
3. File an incident summary; do not re-attempt the same deploy until root cause is understood.

**Rollback involving a migration:**
1. First roll back the application (above) — this alone fixes most incidents if the migration was additive/backward-compatible (expand/contract policy from [02](./02-deployment-architecture.md)).
2. If the migration itself is destructive and must be reversed, run the paired `down` migration (must already exist and be tested per policy in [02](./02-deployment-architecture.md)) against `DIRECT_DATABASE_URL`.
3. If no `down` migration exists (policy violation, but plan for reality) — restore from Neon PITR to just before the migration ran; see [07 — Disaster Recovery Plan](./07-disaster-recovery-plan.md). This is a data-loss risk for anything written after the migration, so only use as a last resort.

## Runbook: OAuth Failure (Connection Hub — Gmail/Outlook/Yahoo)

**Symptom**: users can't connect an account, or sync jobs fail with auth errors.
1. Check Sentry for the specific error (invalid_grant, redirect_uri_mismatch, token expired).
2. `invalid_grant`/expired token → likely the provider revoked access or the refresh token expired; this is expected user-facing behavior — the UI should prompt reconnect. Check `lib/connections/engine.ts` handles this gracefully (surfaces a reconnect prompt, not a 500).
3. `redirect_uri_mismatch` → the OAuth app's registered redirect URI drifted from `BETTER_AUTH_URL`/production domain. Fix in the provider console, not in code.
4. Total outage of one provider (all users failing) → check that provider's status page; if their OAuth service is down, this is not actionable on our end — communicate via status page/support (see [10](./10-30-day-operations-plan.md)).
5. `CONNECTION_HUB_ENCRYPTION_KEY` mismatch (e.g., wrong env var set after a redeploy) → all token decryption fails simultaneously across all providers. This is the most severe variant — treat as a P1 incident, verify the env var against the value used to encrypt existing tokens before anything else.

## Runbook: Redis (Upstash) Failure

**Symptom**: rate limiting fails open or closed unexpectedly; `middleware.ts` errors.
1. Check Upstash dashboard for outage/quota exhaustion.
2. Confirm `lib/cache/redis.ts` fails safe (rate limiter should fail *open*, i.e., allow traffic through rather than 500 every request, during a Redis outage — verify this is actually the implemented behavior, since a fail-closed rate limiter turns a Redis blip into a full site outage).
3. If quota exhausted: this is a capacity gap, not an incident — upgrade the Upstash plan and revisit expected request volume in [03](./03-infrastructure-verification-report.md).

## Runbook: Database (Neon) Failure

1. Check Neon status page + dashboard compute/connection metrics.
2. Connection pool exhaustion (`too many connections`) → check for a leaking Prisma client instantiation (should be a single shared instance via `lib/db/prisma.ts`, not per-request) or a burst beyond the pooled endpoint's limit — mitigate short-term by scaling Neon compute, fix root cause per [05](./05-performance-verification-report.md) index/query audit.
3. Full regional outage → Neon compute is single-region by default; there is no automatic multi-region failover in this architecture today. Communicate downtime via status page. Post-incident: evaluate Neon read replicas for read-path resilience if this recurs.
4. Data corruption/bad migration → go to [07 — Disaster Recovery Plan](./07-disaster-recovery-plan.md) PITR procedure.

## Runbook: Storage (R2) Failure

1. Check Cloudflare status page.
2. Signed URL generation failing → check `R2_ACCESS_KEY_ID`/`SECRET` haven't rotated out of sync with what's set in Vercel prod env.
3. Uploads failing but reads working (or vice versa) → check bucket CORS/permissions weren't partially misconfigured in a recent change.

## Runbook: Background Worker (Inngest) Failure

1. Check the internal admin console (`app/(admin)/jobs/*`) — already built, shows dead-letter queue and retry state.
2. Jobs stuck in retry loop → check the dead-letter handler (`lib/jobs/*`) is actually routing failed jobs there after max retries, not looping indefinitely.
3. Total Inngest outage → check Inngest status page; jobs queue durably on their side and will resume once restored (this is Inngest's core guarantee) — no manual intervention needed beyond monitoring.
4. One job function consistently failing → use the admin console's retry/cancel actions; if it's a code bug, ship a fix through the normal CI/CD pipeline, don't hotfix directly.

## Runbook: High Error Rate Detection

1. Sentry alert fires (requires alert rules configured per [03](./03-infrastructure-verification-report.md) — set threshold now if not already set, e.g., >1% error rate over 5 minutes).
2. Correlate against `instrumentation.ts` trace IDs and Pino structured logs (correlation ID minted in `middleware.ts` propagates through both) to isolate whether it's one route, one org, or global.
3. If tied to a recent deploy → Rollback runbook above.
4. If tied to an external dependency (Neon/Redis/R2/Inngest/OAuth provider) → relevant runbook above.
5. If neither → treat as a new bug, triage per [10 — 30-Day Operations Plan](./10-30-day-operations-plan.md)'s bug triage process.

## Incident Response Process

1. **Declare**: anyone can declare an incident on visible user impact (error spike, outage, data issue).
2. **Communicate**: post status internally immediately; post to a public status page if user-visible and ongoing beyond a few minutes.
3. **Mitigate first, root-cause later**: rollback or the relevant runbook above takes priority over understanding *why*.
4. **Post-incident**: written summary within 48 hours — what happened, impact, mitigation, follow-up actions with owners.

## Emergency Contacts

**Template — fill in with real names/handles before launch, this cannot be populated from the codebase:**

| Role | Contact | Escalation |
|---|---|---|
| Primary on-call engineer | _TBD_ | _TBD_ |
| Database/infra owner (Neon, Upstash, R2 admin access) | _TBD_ | _TBD_ |
| Vercel account owner (deploy/rollback authority) | _TBD_ | _TBD_ |
| Security contact (for `security@` reports, see [08](./08-launch-checklist.md)) | _TBD_ | _TBD_ |

## Timeline

3 days to write and wire alerting for all runbooks above; CI/CD YAML (the highest-value piece) should land first, in Phase 1.
