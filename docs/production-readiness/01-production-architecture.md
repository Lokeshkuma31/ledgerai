# 1. Production Architecture

Two diagrams: what the architecture **is today** (verified by code inspection), and what it **must become** for production launch. The gap between them is the rest of this document set.

## 1.1 Current-state architecture (as built)

```mermaid
flowchart TB
    subgraph Client["Browser"]
        UI["Next.js App Router UI\ndashboard / analytics / AI Coach\n(components/*, app/(app)/*)"]
    end

    subgraph Vercel["Vercel — Next.js 15 / React 19"]
        MW["middleware.ts\nsession-cookie presence check\n+ single generic rate limiter"]
        Pages["App Router pages\n(server components)"]
        API["5 Route Handlers only:\n/api/auth/[...all]\n/api/me\n/api/documents/upload\n/api/connections/[provider]/authorize\n/api/connections/[provider]/callback"]
        Actions["Server Actions\nlib/connections/actions.ts\n(disconnect/refresh/rename —\nNO ownership check, see Security Review)"]
        Engines["In-memory engines\n(NOT durable, NOT distributed)\nlib/sync/engine.ts\nlib/workflows/engine.ts\nlib/feed/engine.ts\n-- only reachable from UI, no API route wires them"]
    end

    subgraph Data["Data plane"]
        Neon[("Neon Postgres\nvia @prisma/adapter-neon\nsingleton client, 47 models")]
        Redis[("Upstash Redis\nrate limiter + AI Coach cache\n+ query history\n(lockKeys/oauthStateKeys defined, UNUSED)")]
        R2[("Cloudflare R2\nreal presigned PUT/GET\nbytes never touch the server")]
    end

    subgraph OAuthReal["OAuth — real, working"]
        BAGoogle["Better Auth sign-in\nGoogle only\n(email/password also real)"]
        CHGoogle["Connection Hub: Google\nPKCE + AES-256-GCM token storage\nproactive refresh"]
        CHMS["Connection Hub: Microsoft\nidentity scope only"]
        CHYahoo["Connection Hub: Yahoo\nidentity scope only"]
    end

    subgraph Mocked["Data connectors — MOCKED (fixtures, no network calls)"]
        Gmail["plugins/gmail\n17 hardcoded fixtures\nno pagination/incremental sync/attachments"]
        AA["plugins/account-aggregator\nclass literally named\n'Account Aggregator (Mock)'"]
        OCR["plugins/document-intelligence\nMockOCRProvider,\nstatic text lookup table"]
        SMS["plugins/android-sms\nbrowser localStorage demo,\nno device bridge, no API route"]
    end

    subgraph NotWired["Installed but NEVER called anywhere in the codebase"]
        Inngest["inngest ^4.14.0\nzero imports, no /api/inngest route"]
        Sentry["@sentry/nextjs\nno config files, zero captureException calls"]
        Otel["OpenTelemetry\nnot even a dependency"]
        PostHog["posthog-js / posthog-node\nzero initialization"]
        Pino["pino\nzero usage — logging is\n2x console.error() call sites"]
    end

    UI --> MW --> Pages
    UI --> API
    UI --> Actions
    Pages --> Neon
    API --> Neon
    API --> R2
    MW --> Redis
    Actions --> CHGoogle & CHMS & CHYahoo
    CHGoogle -.->|"token stored, never used\nfor mail sync"| Gmail
    Engines -.->|"not connected to\nany request path"| Neon

    style NotWired fill:#3a1414,stroke:#c0392b,color:#eee
    style Mocked fill:#3a2f14,stroke:#d68910,color:#eee
    style OAuthReal fill:#143a1e,stroke:#27ae60,color:#eee
```

**Reading this diagram:** the green box (OAuth mechanics) is production-grade. The amber box (connectors) has correct shapes and interfaces but fake data behind them. The red box is the most consequential: five infrastructure capabilities the launch requirements explicitly call for (background jobs, error tracking, tracing, product analytics, structured logging) do not exist in the running system today, regardless of what `package.json` implies.

## 1.2 Target production architecture

```mermaid
flowchart TB
    subgraph Edge["Vercel Edge / Fluid Compute"]
        MWv2["middleware.ts v2\nsession validation + per-route rate limits\n+ security headers (CSP/HSTS/X-Frame-Options)"]
    end

    subgraph App["Next.js App (Node.js runtime, Fluid Compute)"]
        UIv2["App Router UI"]
        APIv2["Route Handlers\n(auth, connections, sync-trigger,\nhealth, admin, webhooks)"]
        Health["/api/health\nDB + Redis + R2 + OAuth + queue checks"]
        ErrBound["error.tsx / global-error.tsx\nReact error boundaries"]
    end

    subgraph Jobs["Inngest — durable background jobs"]
        EmailSync["email-sync\n(incremental, paginated, rate-limited)"]
        MerchantNorm["merchant-normalization"]
        Forecast["forecasting"]
        Recurring["recurring-detection"]
        Summaries["summary-generation"]
        FeedRefresh["feed-refresh"]
        DLQ[["Dead-letter queue\n+ retry with backoff"]]
    end

    subgraph Providers["Real provider connectors"]
        GmailAPI["Gmail API\n(googleapis, OAuth token from Connection Hub)"]
        GraphAPI["Microsoft Graph API\n/me/messages, /me/mailFolders"]
        YahooAPI["Yahoo Mail API\n(or IMAP, pending partner approval)"]
        AAReal["Real account aggregator\n(Plaid-class provider)"]
        OCRReal["Real OCR/LLM vision provider"]
    end

    subgraph Obs["Observability"]
        SentryV2["Sentry\nclient+server+edge configs,\ncaptureException wired into\nhandleApiError/handleActionError"]
        OtelV2["OpenTelemetry SDK\nrequest tracing, span propagation"]
        PostHogV2["PostHog\nserver + client events"]
        PinoV2["Pino structured logger\nrequest-id propagation"]
    end

    subgraph DataV2["Data plane"]
        NeonV2[("Neon Postgres\n+ AuditLog writes wired in")]
        RedisV2[("Upstash Redis\n+ distributed locks (lockKeys)\nactually consumed")]
        R2V2[("Cloudflare R2")]
    end

    Edge --> App
    App --> Jobs
    Jobs --> Providers
    Jobs --> DataV2
    App --> DataV2
    App --> Obs
    Jobs --> Obs
    Providers --> DataV2
    Jobs -.retry exhausted.-> DLQ
```

## 1.3 What changes to get from 1.1 to 1.2

| Capability | Today | Target | Tracked in |
|---|---|---|---|
| Background jobs | Custom in-memory engine, not durable, not reachable from any API route | Inngest functions with retry + DLQ | [05](./05-launch-checklist.md), [06](./06-risk-assessment.md) |
| Email connectors | Fixture data | Real Gmail/Graph/Yahoo API clients with pagination, incremental sync, attachment download | [05](./05-launch-checklist.md) |
| Observability | None wired | Sentry + OTel + PostHog + Pino, all emitting | [05](./05-launch-checklist.md) |
| Security headers | None | CSP, HSTS, X-Frame-Options, per-route rate limits | [03](./03-security-review.md) |
| Health/admin | None | `/api/health`, admin dashboards | [05](./05-launch-checklist.md) |
