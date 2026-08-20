# LedgerAI

**AI-assisted personal finance platform** — connects bank/email accounts, syncs and categorizes transactions, and surfaces spending insights, budgets, and forecasts through an AI coach.

Built as a production-shaped Next.js app: real auth, background job processing, observability, and a documented deployment/incident-response process — not just a CRUD demo.

> **Deploying or rolling back?** See [`DEPLOYMENT.md`](./DEPLOYMENT.md). Full production-readiness docs (security, DR, runbooks, launch checklist) live in [`docs/production-readiness-v2/`](./docs/production-readiness-v2/README.md).

## Features

- **Account syncing** — connects banks and email providers (Gmail, Outlook, Yahoo) via a Connection Hub, with an async, retryable sync pipeline
- **Transactions & budgets** — categorization, recurring-transaction detection, merchant normalization, budgets and goals
- **AI Coach** — conversational insights over a user's own financial data
- **Analytics & forecasting** — spend trends, category breakdowns, cash-flow forecasts
- **Document handling** — statement/receipt upload with OCR extraction
- **Feature-flag kill switch** — provider sync can be disabled instantly in production without a deploy

## Tech stack

| Layer | Choices |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui, Base UI, Recharts |
| Data | PostgreSQL (Neon, serverless driver), Prisma ORM |
| Auth | better-auth |
| Background jobs | Inngest (event-driven, retryable) |
| Caching / rate limiting | Upstash Redis |
| Storage | Cloudflare R2 (S3-compatible) |
| AI | Anthropic SDK |
| Observability | OpenTelemetry, Sentry, Pino structured logging, PostHog analytics |
| Testing | Vitest (unit), Playwright (e2e) |
| CI/CD | GitHub Actions → Vercel |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your own provider/DB credentials
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test        # vitest unit tests
npm run test:e2e    # playwright e2e
npm run build        # production build
```

## Architecture notes

- **`app/`** — route groups split into `(admin)`, `(app)` (the authenticated product surface: dashboard, transactions, budgets, banks, insights, forecast, AI coach, workflows, settings, …), and `api/` (auth, connections, documents, health/liveness/readiness, Inngest webhook)
- **`lib/`** — sync engine, bank integrations, background job definitions, feature flags, observability plumbing, support utilities
- **`prisma/`** — schema and migrations
- **`e2e/`** — Playwright golden-path coverage
- **`docs/production-readiness-v2/`** — security review, disaster-recovery plan, performance report, operational runbook, and launch checklist written for this project

## Status

This project has a full production-readiness pass on the code side (CI/CD workflows, feature-flag kill switch, structured observability, an accessibility pass, e2e coverage). Remaining items are tracked transparently in [`docs/production-readiness-v2/00-progress.md`](./docs/production-readiness-v2/00-progress.md) and are mostly external (provider dashboard access, secrets, legal review) rather than outstanding engineering work.

## License

Private project, shared for portfolio/demonstration purposes.
