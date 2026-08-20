# 05 — Performance Verification Report

## Current State

No performance baseline has ever been captured — no Lighthouse CI, no bundle analyzer run, no load test against the API or job pipeline. OpenTelemetry tracing exists and instruments DB queries (`lib/db/prisma.ts` `$extends` query timing), R2 calls, and job execution, which means the *instrumentation* to answer these questions already exists — it has just never been read in aggregate.

## What to Measure and How

| Metric | Target (initial launch baseline, not aspirational) | How to measure |
|---|---|---|
| **Core Web Vitals** (LCP, INP, CLS) | LCP < 2.5s, INP < 200ms, CLS < 0.1 on the 18 authenticated routes + sign-in | Vercel Speed Insights (zero-config on Vercel) or Lighthouse CI in the CI pipeline against a preview deployment |
| **API latency (Server Actions / route handlers)** | p95 < 500ms for reads, < 1s for writes | Already traced via OpenTelemetry — query the collector/APM for p50/p95/p99 per route over a synthetic smoke-test run |
| **Background job latency (Inngest)** | p95 job completion < 30s for sync jobs (adjust once real provider sync exists — mock jobs are not representative) | Inngest dashboard job duration metrics + `lib/jobs/*` tracing spans |
| **Database query latency** | p95 < 100ms for indexed lookups | Prisma query-timing extension already in `lib/db/prisma.ts` — aggregate its output; cross-check against Neon's own query insights |
| **Bundle size** | First Load JS < 200KB per route (Next.js default budget guidance) | `next build` output + `@next/bundle-analyzer` |
| **Memory usage** | No sustained growth over a 1hr synthetic load run (rules out leaks in long-lived job workers) | Vercel Function metrics / Inngest worker metrics |
| **Cache hit ratio** | > 80% for rate-limiter Redis calls is not meaningful (they're not a content cache); if any read-through cache exists in `lib/cache/`, measure hit ratio there — otherwise mark N/A and note no content caching layer currently exists | Upstash dashboard analytics |

## First real data point (2026-08-06)

Building the golden-path e2e test (`e2e/golden-path.spec.ts`) surfaced the first actual latency measurement in this doc set: `POST /api/auth/sign-up/email` took **8.4–15.3s** against the real dev-mode server + remote Neon connection (uncompiled-route overhead included; a `next build`/`next start` run would be faster but wasn't separately measured yet). Sign-up does real synchronous work — password hash, user/org/membership creation, and seeding 4 built-in `WorkflowDefinition` rows (`lib/auth/better-auth.ts`'s `databaseHooks`) — before redirecting. Even accounting for dev-mode overhead, this is a candidate hot path for the query-latency audit in the Gaps section below; if it's still multi-second under `next start`, consider whether the 4 workflow inserts can run as a single batched `createMany` instead of the current `Promise.all` of four separate `create` calls, or move them off the critical path into a background job.

## Gaps

1. **No load test has ever been run.** Before launch, run a synthetic load test (k6 or Artillery) against the auth → dashboard → transactions golden path at expected launch concurrency (even a conservative estimate, e.g., 50 concurrent users) to catch connection-pool exhaustion (Neon pooled connection limit) or rate-limiter false positives under legitimate burst traffic.
2. **No bundle size budget enforced in CI.** Add `@next/bundle-analyzer` output as a CI artifact and fail the build (or warn) past a defined threshold, so bundle size regressions are caught at PR time, not discovered post-launch.
3. **Query performance / index audit not done.** Given the schema is org/membership-scoped multi-tenant (per `prisma/schema.prisma`), the highest-risk queries are anything filtering by `organizationId` without a composite index. **Action**: run `EXPLAIN ANALYZE` on the top 10 hottest queries (dashboard aggregate, transaction list, search) against a realistic data volume (seed 10k+ transactions in a Neon branch) — this is the single highest-value performance action given fintech dashboards are inherently aggregate-query-heavy.
4. **Cache hit ratio question reveals a gap, not just a metric**: there does not appear to be a content/read cache layer beyond rate-limiting — dashboard aggregates likely hit Postgres on every load. Not a launch blocker, but flag as the top post-launch performance workstream if dashboard load times are slow under the load test above.

## Success Criteria

- [ ] Lighthouse CI wired into the CI pipeline, baseline captured and committed to this doc
- [ ] One synthetic load test executed against a preview/staging environment, results recorded here
- [ ] Index audit completed for the top 10 hottest queries, any missing composite indexes added via a migration
- [ ] Bundle size budget defined and enforced (warn initially, fail once a baseline is established)

## Timeline

2 days for instrumentation/measurement setup + first baseline capture. Can run in parallel with Phase 2–3. Full load test requires CI/staging environment from Phase 1, so it's sequenced after basic CI exists.
