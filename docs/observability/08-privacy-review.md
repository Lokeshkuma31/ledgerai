# 08 — Privacy Review

## Purpose

This is the authoritative "never log this" list for every module under `lib/observability/`. It is referenced by [03-logging-specification](./03-logging-specification.md), [04-tracing-strategy](./04-tracing-strategy.md), and [05-analytics-event-catalog](./05-analytics-event-catalog.md) rather than restating these rules in each — this document is the single source of truth for what's forbidden.

This extends, and is consistent with, `docs/security-hardening/06-audit-logging-design.md`'s existing redaction rule for `AuditLog` ("never log token material") and `lib/connections/types.ts`'s existing `StoredConnection` vs. `ConnectionRecord` split (tokens never leave `lib/connections/registry.ts`). The observability layer must not become a second path by which secrets that are already correctly excluded from the audit trail leak into logs, traces, or error reports.

## Absolute prohibitions — must never appear in any log line, span attribute, error report, or analytics event property

| Category | Examples in this codebase | Why it's dangerous even in an internal log |
|---|---|---|
| OAuth access tokens | `StoredConnection.accessToken` (`lib/connections/types.ts`) | Directly usable to impersonate the user against Google/Microsoft/Yahoo |
| OAuth refresh tokens | `StoredConnection.refreshToken` | Longer-lived than access tokens; a leaked refresh token survives token rotation |
| OAuth state/PKCE values | `lib/connections/oauth.ts`, `lib/connections/session.ts`'s httpOnly state cookie | Not directly a credential, but combined with other leaked data can enable CSRF/session-fixation-style attacks against the OAuth flow |
| Session tokens / cookies | Better Auth session cookie, `getSessionCookie()` return value | Session hijacking |
| Passwords | Never stored in plaintext already (Better Auth handles hashing) — but the raw `password` field from sign-in/sign-up request bodies must never reach a log even transiently (e.g. via a naive "log the request body" debug statement) | |
| Encryption keys | AES-256-GCM key used by `lib/connections/token-manager.ts` | |
| Financial transaction descriptions | `Transaction.description`/`merchantRaw` fields (Prisma schema) | Reveals what a user bought, from whom, potentially health/political/religious-affiliation-adjacent purchases |
| Transaction amounts / balances | Any `Decimal`/currency field | Precise financial data; also makes analytics events into a definitionally sensitive dataset if included |
| Raw documents | Uploaded files in R2 (receipts/invoices/statements), their extracted OCR text | `document-intelligence` plugin output is exactly the kind of content that must stay in R2 + the DB behind normal access control, never duplicated into a log line for debugging convenience |
| Raw emails | Gmail plugin's imported message bodies/subjects/attachments | Same reasoning as documents, plus third-party correspondents' data (not just the user's own) |
| SMS content | `android-sms` plugin's imported message bodies | Same reasoning |
| Attachments | Any file bytes or base64-encoded content | |
| Full user PII beyond what's operationally necessary | Full name, full email address, phone number, physical address | See "necessary PII" below for what's allowed |

## What IS allowed (necessary PII, narrowly scoped)

- **User ID** (`User.id`, a UUID/CUID) — not the email or name. This is what `userId` means throughout [03](./03-logging-specification.md) and [09](./09-correlation-id-strategy.md).
- **Session ID** (Better Auth's internal session identifier, not the cookie value itself).
- **Provider name** (`"google"`, `"microsoft"`, `"yahoo"`, `"gmail"`, `"android-sms"`) — a category, not an account identifier.
- **Connection ID** — an internal UUID referencing a `Connection` row, not the connected account's email/username.
- **Counts, durations, statuses, error codes** — `count: 12`, `durationMs: 340`, `status: "failed"`, `errorCode: "RATE_LIMITED"`.
- **Document/plugin/job type identifiers** — `document_type: "receipt"`, `plugin_id: "gmail"`, `job_type: "documentParse"` — categorical metadata, not content.

## Enforcement mechanisms

1. **Pino redaction paths** (`logger.ts`): configure Pino's built-in `redact` option with an explicit deny-list of key paths (`accessToken`, `refreshToken`, `password`, `token`, `authorization`, `cookie`, `description`, `amount`, `balance`) as a defense-in-depth backstop — even if a call site accidentally passes a forbidden field, Pino redacts it to `"[Redacted]"` rather than serializing it. This does not replace disciplined call sites; it's a safety net for the case where it fails.
2. **Span attribute allow-list, not deny-list** ([04-tracing-strategy](./04-tracing-strategy.md)): tracing helpers (`withActionSpan`, the Prisma `$extends` wrapper, OAuth step spans) only ever set attributes from a fixed, reviewed set (model name, operation, duration, status, provider, ids) — they never accept "extra attributes" as a free-form object that a call site could accidentally stuff a token into. This is a stronger guarantee than a deny-list for the highest-risk surface (OAuth spans).
3. **Sentry `beforeSend` scrubbing** (`errors.ts`): Sentry's default PII scrubbing (`sendDefaultPii: false`) stays off — this app does not want Sentry's automatic IP/cookie capture. A custom `beforeSend` hook strips `request.cookies`, `request.headers.authorization`, and recursively scrubs any key matching the same deny-list as the Pino redaction config, applied to exception `extra` context and breadcrumbs.
4. **PostHog event property review** ([05-analytics-event-catalog](./05-analytics-event-catalog.md)): every event's property list in the catalog is the exhaustive list — `analytics.ts`'s `capture()` wrapper takes a typed event name + typed properties (not an arbitrary object), so a call site cannot pass an extra, unreviewed property without a type error.
5. **Code review checklist** ([10-production-monitoring-checklist](./10-production-monitoring-checklist.md)) includes an explicit "does this PR add a new log/span/event call site, and if so does it comply with this document" check.

## Existing correct behavior to preserve, not duplicate

- `lib/audit/log.ts`'s `recordAuditEvent()` already never logs token material and already never throws (so a broken audit write can't cascade into a broken request). The observability logger must not become a second, less-careful audit trail — domain events that belong in `AuditLog` (connection lifecycle, auth events, access-denied events) stay in `AuditLog`; the observability logger captures *operational* events (request/job/query lifecycle), not the security-relevant domain events `AuditLog` already owns. Where both are relevant (e.g. a failed OAuth token refresh), the operational log and the audit event are both emitted, from the same code path, sharing a `correlationId` — not merged into one system.
- `lib/connections/types.ts`'s `ConnectionRecord` (client-safe) vs. `StoredConnection` (server-only, has tokens) split is the existing pattern for "the client-safe shape excludes secrets." Any observability code that touches connection data must consume `ConnectionRecord`, never `StoredConnection`, unless it's inside `lib/connections/registry.ts` itself.

## Data retention

Not an application-code concern for this phase, but flagged for the deployment checklist: Sentry, PostHog, and the log drain each have their own retention settings that should be configured to the shortest period that satisfies operational/compliance needs — this design does not implement a custom retention/deletion pipeline for telemetry data. `AuditLog`'s retention is out of scope for this document (owned by `docs/security-hardening/06-audit-logging-design.md`).
