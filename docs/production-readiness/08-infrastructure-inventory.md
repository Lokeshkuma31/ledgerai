# 8. Infrastructure Inventory

Every external service, account, and configuration surface this application depends on, with current provisioning status.

## 8.1 Hosting & compute

| Service | Purpose | Status |
|---|---|---|
| Vercel | Hosting, builds, preview deployments, Fluid Compute for Next.js | Project linked (`ledgerai`, org `team_LOEZefvMAz4uCmv4TzXcujCJ`, `.vercel/project.json`). No `vercel.ts`/`vercel.json` — all config is implicit defaults. Vercel CLI not installed locally. |

## 8.2 Data stores

| Service | Purpose | Status |
|---|---|---|
| Neon PostgreSQL | Primary database, via `@prisma/adapter-neon` | Connected (`DATABASE_URL`/`DIRECT_DATABASE_URL` in `.env.example`). Single environment configured; no confirmed dev/preview/prod branch separation. PITR retention window not confirmed. |
| Upstash Redis | Rate limiting, AI Coach cache, query history | Connected via `KV_REST_API_URL`/`KV_REST_API_TOKEN` (Vercel Marketplace naming). Single environment; `lockKeys`/`oauthStateKeys` scaffolded but unused. |
| Cloudflare R2 | Object storage for uploaded documents | Connected via `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`/`R2_ENDPOINT`. Not on Vercel Marketplace — provisioned manually in Cloudflare dashboard. Bucket versioning/lifecycle policy not confirmed. |

## 8.3 Background jobs

| Service | Purpose | Status |
|---|---|---|
| Inngest | Durable background job execution (email sync, merchant normalization, forecasting, recurring detection, summaries, feed refresh) | `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` documented in `.env.example`; **package installed (`^4.14.0`) but entirely unwired in code** — no client, no functions, no `/api/inngest` route. This is the single largest infrastructure gap. |

## 8.4 Authentication & OAuth

| Provider | Purpose | Status |
|---|---|---|
| Better Auth (self-hosted, `better-auth` package) | User identity — email/password + social sign-in | Configured, real, working for email/password + Google |
| Google OAuth (Better Auth app) | User sign-in via Google | `BETTER_AUTH_GOOGLE_CLIENT_ID/SECRET` — separate OAuth app from Connection Hub's Google credentials by design |
| Google OAuth (Connection Hub app) | Data-source connection (Gmail read access) | `GOOGLE_OAUTH_CLIENT_ID/SECRET` — real PKCE flow implemented; **production OAuth consent screen verification requires a live privacy policy URL, which does not exist yet** |
| Microsoft OAuth (Connection Hub) | Data-source connection (Outlook, identity scope only today) | `MICROSOFT_OAUTH_CLIENT_ID/SECRET` — real PKCE flow; no user-identity sign-in variant exists |
| Yahoo OAuth (Connection Hub) | Data-source connection (identity scope only today) | `YAHOO_OAUTH_CLIENT_ID/SECRET` — real PKCE flow; Yahoo Mail API access requires separate partner approval per the code's own documentation |
| `CONNECTION_HUB_ENCRYPTION_KEY` | AES-256-GCM key for encrypting stored OAuth tokens | Generated via `openssl rand -base64 32`; must be a durable, backed-up secret — losing it invalidates every stored connection token |
| `BETTER_AUTH_SECRET` | Session/cookie signing | Generated via `openssl rand -base64 32` |

## 8.5 AI provider

| Service | Purpose | Status |
|---|---|---|
| Configurable AI provider (`AI_PROVIDER` env var) | AI Coach backend — supports `anthropic \| openai \| gemini \| openrouter \| ollama` | `@anthropic-ai/sdk` is a direct dependency; `.env.example` documents all five provider options with per-provider key/model vars. Default in `.env.example` is `openrouter`. Decide the production provider explicitly (cost, rate limits, data-handling terms matter for a fintech product touching financial data in prompts) rather than shipping whatever's set locally. |

## 8.6 Observability (required, not yet provisioned in code)

| Service | Purpose | Status |
|---|---|---|
| Sentry | Error tracking | `@sentry/nextjs` installed; **zero config files, zero `captureException` calls** — needs a Sentry project created, DSN issued per environment, and `sentry.client/server/edge.config.ts` written |
| OpenTelemetry | Distributed tracing | **Not even a dependency yet** — needs `@opentelemetry/*` packages added and an exporter target chosen (Vercel's OTel integration, or a third-party like Honeycomb/Datadog) |
| PostHog | Product analytics | `posthog-js`/`posthog-node` installed; **zero initialization** — needs a PostHog project (cloud or self-hosted), API key per environment |
| Pino | Structured logging | Installed; **unused** — logging is currently 2 `console.error` call sites. No log aggregation destination decided yet (Vercel's log drain, Axiom, Datadog, etc.) |

## 8.7 CI/CD (required, not yet provisioned)

| Service | Purpose | Status |
|---|---|---|
| GitHub Actions | Typecheck/lint/test on PR, migration safety checks, release workflow | No `.github/` directory exists — needs to be created from scratch |
| Vercel's GitHub integration | Preview deployments | Presumably available once repo is connected in Vercel dashboard (not independently confirmed in this audit) |

## 8.8 Legal / compliance surfaces (not yet provisioned)

| Item | Status |
|---|---|
| Privacy policy hosting | Does not exist — also a hard dependency for Google OAuth production verification |
| Terms of service | Does not exist |
| Cookie policy | Does not exist |

## 8.9 Key dependency versions (from `package.json`, production-relevant)

`next@^15`, `react@^19`/`react-dom@^19`, `@prisma/client@^7.9.1` + `prisma@^7.9.1` + `@prisma/adapter-neon@^7.9.1`, `@neondatabase/serverless@^1.1.0`, `better-auth@^1.6.25`, `@upstash/redis@^1.38.1` + `@upstash/ratelimit@^2.0.8`, `@aws-sdk/client-s3@^3.1101.0` + `@aws-sdk/s3-request-presigner@^3.1101.0` (R2), `inngest@^4.14.0`, `@sentry/nextjs@^10.69.0`, `posthog-js@^1.410.4` + `posthog-node@^5.47.7`, `pino@^10.3.1`, `@anthropic-ai/sdk@^0.115.0`, `zod@^4.4.3`, `@tanstack/react-query@^5.101.4`.

**Note on Next.js version**: `AGENTS.md` at the repo root flags that this Next.js version has breaking changes vs. training-data assumptions and directs implementers to `node_modules/next/dist/docs/` before writing code against it — worth a deliberate read-through at the start of Phase 0/1 implementation work, not something to skip on the assumption that "Next.js 15" behaves as commonly remembered.

## 8.10 Secrets inventory & rotation policy

No secret-rotation policy exists yet for any of the above. At minimum, before launch, document: rotation cadence for `CONNECTION_HUB_ENCRYPTION_KEY` and `BETTER_AUTH_SECRET` (note: rotating the encryption key invalidates all stored OAuth tokens unless a re-encryption migration is built — plan for this explicitly rather than treating rotation as trivial), owner/access list for each provider console (Google Cloud Console, Azure Portal, Yahoo Developer Network, Cloudflare, Neon, Upstash, Vercel, Inngest, Sentry, PostHog), and where production secrets live (Vercel environment variables — confirmed no hardcoded secrets in source, per [03](./03-security-review.md)).

See [02 — Deployment Architecture](./02-deployment-architecture.md) for how these map across dev/preview/prod, and [09 — Go-Live Plan](./09-go-live-plan.md) for provisioning sequence.
