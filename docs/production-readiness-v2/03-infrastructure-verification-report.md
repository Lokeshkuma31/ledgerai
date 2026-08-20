# 03 — Infrastructure Verification Report

Audit of every external service this app depends on. Status reflects code-level wiring confirmed by direct inspection; **account-level settings (plan tier, retention windows, DNS records) must be verified by the user directly in each provider's dashboard** — I cannot inspect those from the repo.

## Service-by-service

| Service | Code wiring | What to verify in the dashboard |
|---|---|---|
| **Neon PostgreSQL** | `lib/db/prisma.ts`, `@neondatabase/serverless` + `@prisma/adapter-neon`. Two-URL pattern (`DATABASE_URL` pooled, `DIRECT_DATABASE_URL` unpooled for migrations) — correct pattern, documented reasoning about pgbouncer swallowing `_prisma_migrations` writes. | Confirm PITR (point-in-time recovery) is enabled and retention window (default 7 days on paid plans — extend if RPO requires more, see [07](./07-disaster-recovery-plan.md)). Confirm compute autoscaling limits won't throttle under launch load. Confirm connection limit vs. expected concurrent Vercel function instances. |
| **Upstash Redis** | `lib/cache/redis.ts`, rate limiters (`apiRateLimit` + named limiters per `docs/security-hardening/05-rate-limiting-strategy.md`), wired into `middleware.ts` + Server Actions. | Confirm production database (not free-tier eviction-prone dev instance). Confirm max request/day quota covers expected traffic — rate limiter itself adds Redis calls on every request. |
| **Cloudflare R2** | `lib/storage/r2.ts`, `lib/storage/signed-url.ts`, real `S3Client`, tracing-instrumented. | Confirm bucket CORS policy for signed-upload flows. Confirm lifecycle rules (if documents should expire/archive). Confirm bucket is not publicly listable. |
| **Inngest** | `lib/jobs/*` — dispatcher, engine, worker, registry, scheduler, dead-letter, idempotency, retry. Exposed via `app/api/inngest`. 10 job functions under `lib/jobs/functions/`. | Confirm production Inngest environment (not dev/branch env) is what `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` in Vercel prod env point to. Confirm dead-letter alerting is connected to a real notification channel (see [06](./06-operational-runbook.md)). |
| **Better Auth (app auth)** | `lib/auth/better-auth.ts` — email/password + conditional Google OAuth, Prisma adapter, auto-provisioning. | Confirm `BETTER_AUTH_SECRET` is a distinct, high-entropy production value (not the dev `.env.local` value). Google OAuth app confirmed out of testing mode (2026-08-06) ✅ — **double-check this is the same Google Cloud OAuth client used here and not just the Connection Hub's** (see next row); they may be two separate registered apps. |
| **Connection Hub OAuth** (Gmail/Outlook/Yahoo data connections — separate from app auth) | `lib/connections/`, AES-256-GCM token encryption via `CONNECTION_HUB_ENCRYPTION_KEY`, PKCE. | Google confirmed out of testing mode (2026-08-06) ✅. **Microsoft and Yahoo still ⬜** — confirm production redirect URIs and out of "testing"/sandbox mode for both before launch. Confirm `CONNECTION_HUB_ENCRYPTION_KEY` is a production-only secret, rotated independently of dev. |
| **Sentry** | `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`, `next.config.ts` (`withSentryConfig`), `instrumentation.ts` (`onRequestError`). | Confirm production DSN vs. dev DSN separation (`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`). Confirm alert rules exist (error rate spike, new issue type) and route to a real channel. |
| **OpenTelemetry** | `instrumentation.ts` (`@vercel/otel`), `lib/observability/tracing.ts` (custom always-sample for errors/jobs/OAuth/Server Actions). | Confirm `OTEL_EXPORTER_OTLP_ENDPOINT` points to a production collector with acceptable retention/cost, and `OTEL_TRACE_SAMPLE_RATE` is tuned for expected volume (100% sampling of everything at scale will be expensive). |
| **PostHog** | `lib/observability/analytics.ts` — ~14/30 catalog events wired; budget/goal/dashboard/search/AI-coach events not yet wired (dependent on real provider sync). | Confirm production project key, not the dev project. Confirm data residency/region setting matches privacy requirements. |
| **Pino** | `lib/observability/logger.ts`, JSON-only. | Confirm `LOG_LEVEL` in production is `info` or `warn`, not `debug` (cost + PII exposure risk). Confirm log sink (Vercel log drain or equivalent) retains logs long enough for incident investigation. |

## Environment Variables — Full Inventory (38 vars, `.env.example`)

| Group | Vars | Rotation notes |
|---|---|---|
| AI provider | `AI_PROVIDER`, `ANTHROPIC_API_KEY`/`MODEL`, `OPENAI_API_KEY`/`MODEL`, `GEMINI_API_KEY`/`MODEL`, `OPENROUTER_API_KEY`/`MODEL`, `OLLAMA_BASE_URL`/`MODEL` | API keys — rotate on any suspected leak, no fixed schedule needed pre-launch |
| Connection Hub OAuth | `CONNECTION_HUB_ENCRYPTION_KEY`, Google/Microsoft/Yahoo client id+secret (7) | Encryption key rotation requires a re-encryption migration of stored tokens — plan this explicitly, don't rotate casually once real tokens exist |
| Database | `DATABASE_URL`, `DIRECT_DATABASE_URL` | Neon-managed; rotate via Neon dashboard role reset if compromised |
| Redis | `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Rotate via Upstash dashboard |
| Inngest | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Rotate via Inngest dashboard; signing key rotation requires a brief dual-key overlap window |
| R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` | Rotate access keys via Cloudflare dashboard |
| Better Auth | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_GOOGLE_CLIENT_ID`/`SECRET` | `BETTER_AUTH_SECRET` rotation invalidates all active sessions — plan for a maintenance window |
| Observability | `LOG_LEVEL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_TRACE_SAMPLE_RATE`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ENABLED`, `SENTRY_ORG`, `SENTRY_PROJECT`, `NEXT_PUBLIC_POSTHOG_KEY`, `POSTHOG_HOST` | Low sensitivity, standard rotation on leak only |

**Action**: run `vercel env pull` against the production environment and diff against `.env.example` to confirm no var is missing in production and no stray dev-only var (e.g., `OLLAMA_BASE_URL`, useless in serverless prod) is set there unnecessarily.

## Secrets Management Policy

- All secrets live in Vercel Environment Variables, scoped per environment (Development/Preview/Production) — never committed, `.env.local` is gitignored (confirmed).
- No secrets-manager (e.g., Doppler, AWS Secrets Manager) is in use; Vercel env vars are sufficient at this scale. Revisit only if secret sprawl grows past what `vercel env` can manage cleanly.
- **Gap**: no documented rotation cadence. Recommend: quarterly rotation for `BETTER_AUTH_SECRET` and `CONNECTION_HUB_ENCRYPTION_KEY` (highest blast radius), on-demand for everything else.

## DNS / SSL

Not inspectable from the repo. **User action required**: confirm the production custom domain is attached in Vercel (auto-provisions SSL via Let's Encrypt), confirm domain registrar DNS points at Vercel's assigned records, and confirm no mixed-content or stale CNAME issues. Flag this explicitly on the [Launch Checklist](./08-launch-checklist.md).

## Success Criteria

- [ ] Every row above verified against the live dashboard, not just the code
- [ ] `vercel env pull` diffed against `.env.example` with zero drift
- [ ] Neon PITR confirmed enabled with adequate retention
- [ ] Rotation policy written down (see above) and first rotation scheduled

## Timeline

1–2 days — mostly dashboard verification, not code changes. Owner: whoever holds admin access to each provider account.
