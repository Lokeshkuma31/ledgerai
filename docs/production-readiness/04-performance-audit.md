# 4. Performance Audit

This audit assesses the areas the launch scope explicitly names: database queries/indexes, connection pooling, React rendering, bundle size, lazy loading, caching, streaming, image loading, and API latency. Because Inngest and real connectors aren't wired yet ([01](./01-production-architecture.md)), there is no production load pattern to profile directly — this is a structural review of what will bottleneck once real traffic and real sync jobs exist.

## 4.1 Database

**Connection handling — good.** `lib/db/prisma.ts` uses `@prisma/adapter-neon` with a `globalThis`-cached singleton, explicitly designed for Fluid Compute's warm-instance reuse rather than one-connection-per-invocation. This is the correct pattern for Neon + serverless Next.js and avoids the classic "exhausted connection pool" failure mode of naive PrismaClient instantiation per request.

**Indexing — mostly solid, with specific gaps.** 33 `@@index` directives across 47 models. Core hot paths are covered: `Transaction` has `@@index([organizationId, date])` and `@@index([organizationId, reviewed])`; `Merchant` has `@@index([organizationId, canonicalName])`. Gaps found:
- `Transaction` has no composite index covering `organizationId + merchantId` (only a bare `merchantId` index) — a merchant-detail page's transaction list will not use the most selective index available once organizations have meaningfully more data.
- `Transaction` has no index on category columns (`aiCategoryId`/`userCategoryId`) — category-filtered views (e.g., "show all Dining transactions") will table-scan within the org partition.
- `Transaction.searchVector` and `Merchant.searchVector` are `Unsupported("tsvector")` columns. Prisma's schema DSL cannot declare a GIN index on these, so it must exist (or not) purely in the raw migration SQL. **This needs direct verification against `prisma/migrations/*/migration.sql`** before launch — a `tsvector` column without a GIN index is functionally useless for search performance (full scan + sort on every query) and is an easy thing to have added the column for but forgotten the index.

**Action items:** add the two missing `Transaction` composite/category indexes; verify (and add if missing) GIN indexes on both `searchVector` columns; run `EXPLAIN ANALYZE` on the actual search and transaction-list queries once volume-representative seed data exists, not just against the empty/small dev database.

## 4.2 Caching

Upstash Redis is used for the rate limiter, AI Coach response caching (`services/coach/coach-cache-service.ts`), and query history (`services/query/query-history-service.ts`) — a real, working cache layer for the parts of the app that use it. Two things worth flagging:

- `lib/cache/keys.ts` defines `lockKeys` (sync + workflow-run distributed locks) and `oauthStateKeys`, but the audit found **no live call sites** consuming them — they're scaffolded but unused. Once background jobs are wired (Inngest), distributed locking will matter (to prevent two concurrent sync runs for the same connection); this scaffolding should either be finished or removed, not left half-wired.
- No caching layer exists yet for expensive read paths outside AI Coach/query-history — e.g., dashboard aggregate queries, analytics rollups. Once real data volume exists, these are the first candidates for either Redis caching or database-level materialized views/summary tables, depending on how fresh the numbers need to be.

## 4.3 API latency

Only 5 Route Handlers exist today (`auth`, `me`, `documents/upload`, `connections/authorize`, `connections/callback`), so there isn't yet a broad surface to latency-test. The structural risk is what happens when sync/job-triggering routes are added: **without Inngest wired, any route that triggers a sync currently has no path except running the work inline in the request**, which is both a correctness problem (serverless functions have execution time limits) and a latency problem (a user-facing request blocked on an external API call chain). This is why Inngest wiring is a launch blocker independent of the "background jobs" feature checklist — it's also the performance fix for API latency on any endpoint that would otherwise call out to Gmail/Graph/Yahoo/aggregator APIs synchronously.

No `Cache-Control` / ISR / ` revalidate` strategy was found configured on any page or API route — every page renders dynamically per request by default. Once real usage patterns are understood, static/analytics pages that don't need per-request freshness are candidates for ISR or route-level caching (Next.js 15 supports this natively — see the `vercel:next-cache-components` and `vercel:runtime-cache` skills for current patterns).

## 4.4 React rendering & bundle size

Not deeply profiled in this pass (would require a running build + bundle analyzer, which wasn't run as part of this static audit) — flagged as an open item for the [Launch Checklist](./05-launch-checklist.md) rather than assessed here. Structural notes from the dependency list: `recharts` (charting), `html2canvas` + `jspdf` (client-side PDF export) are both meaningfully sized client bundles — confirm they're dynamically imported (`next/dynamic`) on the routes that use them (analytics, export flows) rather than included in the main bundle for users who never visit those pages. `next.config.ts` has no bundle analyzer configured — add `@next/bundle-analyzer` (or equivalent) to CI or a manual audit script before launch to get real numbers instead of guesses.

## 4.5 Image loading

No custom `images` config in `next.config.ts` (stub file, confirmed in [02](./02-deployment-architecture.md)). Next.js's built-in image optimization is available but unconfigured (no `remotePatterns` for any external image sources, e.g., merchant logos or provider avatars, if those are ever added). Low priority unless the product surfaces user-supplied or remote images — verify against actual UI before treating this as a real gap.

## 4.6 Streaming

No use of React Server Component streaming/`loading.tsx` boundaries was confirmed in this pass (not exhaustively checked — flagged for follow-up). Next.js 15 on Vercel supports streaming SSR by default; the main risk is if any data-heavy dashboard page fetches everything before rendering anything, producing a blank-screen wait. Given the earlier finding that there are no `error.tsx`/`global-error.tsx` boundaries anywhere under `app/` ([observability audit](./01-production-architecture.md)), it's a reasonable bet that `loading.tsx` boundaries are similarly sparse — both should be added together as part of the same App Router hygiene pass.

## 4.7 Performance testing

No load-testing tooling (k6, Artillery, autocannon) or configuration was found anywhere in the repo. There is currently no baseline for "how many concurrent users / requests-per-second can this handle" — this cannot be answered until (a) Inngest is wired so sync work is off the request path, and (b) real connectors replace mocks, since mocked connectors respond near-instantly and give a false sense of API latency. **Load testing should happen after connector work lands, not before** — testing against mocks would validate the wrong bottleneck.

## 4.8 Priority order

1. Verify/add GIN indexes on `searchVector` columns (§4.1) — cheap, high-impact if missing
2. Add missing `Transaction` composite/category indexes (§4.1)
3. Wire Inngest so sync work leaves the request/response path (§4.3) — also a correctness fix, not just performance
4. Run a bundle analysis pass, dynamic-import `html2canvas`/`jspdf`/`recharts` where not already done (§4.4)
5. Add `loading.tsx` boundaries to data-heavy routes (§4.6)
6. Load-test after real connectors land (§4.7)

See [05 — Launch Checklist](./05-launch-checklist.md) for the performance section of the go-live punch list.
