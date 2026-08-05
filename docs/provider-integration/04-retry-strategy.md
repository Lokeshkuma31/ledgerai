# 4. Retry Strategy

## 4.1 The retry engine already exists — this document extends its classification, not its mechanics

`lib/jobs/retry.ts` already implements the full retry mechanism every job in the platform uses: exponential backoff is delegated to Inngest's own per-function `retries` count (not independently configurable — see `docs/job-platform/05-retry-strategy.md` §5.3 for why), transient/permanent classification lives in `classifyError()`, and `RETRY_COUNTS["sync-run"] = 4` (`lib/jobs/retry.ts:21`) is already the retry budget for every sync job, real or mock. **This plan does not change the retry mechanism.** It changes what real providers must do to make the existing classifier see the right thing.

## 4.2 The existing classification rule (verbatim, for reference)

`classifyError()` (`lib/jobs/retry.ts:52-83`), fail-closed by design — unrecognized error shapes are treated as permanent, not silently retried:

| Signal | Classification |
|---|---|
| `NonRetriableError` instance | permanent |
| `ZodError` / `ValidationError` | permanent |
| `ECONNRESET`/`ETIMEDOUT`/`ECONNREFUSED`/`EAI_AGAIN`/`EPIPE` codes, `AbortError`, "fetch failed"/"network" in message | transient |
| HTTP 429 | transient |
| HTTP 401 / 403 | **permanent** |
| HTTP 404 | permanent |
| HTTP 5xx | transient |
| Prisma `P1xxx` / `P2024`, Redis/Upstash errors | transient |
| Anything else | permanent (fail closed) |

## 4.3 The gap: provider error bodies don't map cleanly onto HTTP status alone

Section 3.3 of `03-api-quota-strategy.md` already identified the sharpest instance of this: Gmail returns quota exhaustion as HTTP 403, which the table above classifies `permanent` — indistinguishable, by status code alone, from an actually-revoked OAuth grant (also 403). Retrying a revoked-permission error 4 times wastes budget on something that will never succeed until the user reconnects; **not** retrying a rate-limited request loses legitimate sync progress that would have succeeded seconds later. Getting this distinction right matters more for user experience than the backoff curve itself.

**Resolution, per provider — each maps onto the existing `transient`/`permanent` taxonomy by construction, at the provider-service layer, before the error reaches `classifyError()`:**

| Provider | Condition | True classification | How the provider service must surface it |
|---|---|---|---|
| Gmail | `reason: "quotaExceeded"` / `"rateLimitExceeded"` / `"userRateLimitExceeded"` (HTTP 403 body) | transient | Set `status: 429` on the thrown error before it reaches `classifyError()` (or throw a dedicated `QuotaExceededError` the service layer classifies transient directly) — never let the literal HTTP 403 pass through unmodified |
| Gmail | `reason: "insufficientPermissions"` / `"authError"` (also HTTP 403) or HTTP 401 | permanent | Pass through unmodified — this is a real revoked/insufficient grant, and `01-provider-integration-architecture.md` §2 already routes this to `permission-revoked` at the Connection layer, independent of the job's own retry |
| Microsoft Graph | HTTP 429 with `Retry-After` header | transient | Pass through unmodified (already correctly classified); prefer honoring `Retry-After` over the generic curve per §3.5 |
| Microsoft Graph | HTTP 401 `InvalidAuthenticationToken` | permanent | Pass through unmodified |
| Yahoo | Unknown pending partner docs (§3.2) | TBD | Must be resolved during Yahoo partner onboarding before Yahoo's provider service ships — flagged as a rollout blocker, not assumed to match Gmail's shape |
| Account Aggregator | AA Gateway structured error envelope (ReBIT spec: distinct codes for consent-expired vs. FIP-downtime vs. rate-limited) | Consent-expired → permanent (requires reauthentication, not a retry); FIP/AA downtime → transient; rate-limited → transient | AA's error envelope must be mapped explicitly per code — do not assume any AA HTTP status implies a classification the way Gmail/Graph's do, since the AA Gateway wraps FIP-originated errors in its own envelope regardless of transport status |
| OCR provider | Vendor-specific — typically 429 (rate) vs. 400 (malformed input, e.g. corrupt PDF) vs. 5xx (vendor outage) | 429/5xx transient, 400 permanent | Standard mapping once a vendor is selected (§5); no special-casing expected here unlike the mail providers |

This mapping work happens entirely inside `services/email/email-import-service.ts` / the equivalent bank/AA/document services — `lib/jobs/retry.ts::classifyError()` itself is never edited to add a provider-specific branch, preserving the provider-agnostic boundary `01-provider-integration-architecture.md` §1.4 requires.

## 4.4 Backoff curve

Inherited unchanged from `docs/job-platform/05-retry-strategy.md` §5.3: Inngest's built-in exponential backoff per function, driven solely by the `retries` count declared in `defineJob()`'s options. No provider gets a custom curve — the existing `RETRY_COUNTS` table already differentiates by *job type*, and that differentiation carries over correctly (`sync-run: 4`, `connection-validate: 2`, `document-parse: 3`). The one addition this plan makes: where a provider supplies an explicit `Retry-After` (Graph does reliably; AA may, per its Gateway's error envelope), the provider service should prefer scheduling via `step.sleep()` inside the function body for that specific attempt over trusting Inngest's generic curve blindly — see `03-api-quota-strategy.md` §3.5 for the tradeoff.

## 4.5 Max retry counts, extended for new job types this plan introduces

`RETRY_COUNTS` (`lib/jobs/retry.ts:20-40`) already covers `sync-run`, `document-parse`, `connection-validate`. This plan adds no new job *types* — Account Aggregator sync reuses `sync-run` (its `providerCategory` is already `ACCOUNT_AGGREGATOR` in the `SyncProviderCategory` Prisma enum, `prisma/schema.prisma:314`), and OCR reuses `document-parse`. **No change to `RETRY_COUNTS` is required by this plan** unless production data after Gmail's rollout (§8) shows 4 retries is miscalibrated for real-world Gmail transient-error rates, in which case it is a one-line config change, not a design change.

## 4.6 Observability of retries

Already substantially wired and reused unchanged:

- `JobRun.attempt` (Prisma, `prisma/schema.prisma:1334`) tracks the current attempt number per run.
- `recordJobDuration()` (`lib/observability/metrics.ts:52-54`) records every attempt's duration tagged `{job.type, job.status}` — extended, per this plan, to also tag `{provider}` for `sync-run`/`document-parse` specifically, so a Gmail-vs-Outlook-vs-Yahoo retry-rate comparison is queryable without a new metric.
- `serializeError()` (`lib/jobs/retry.ts:142-147`) captures `{message, name, stack}` into `JobRun.error` (Json) on final failure — already excludes token material by construction (an OAuth error's `Error.message` from `oauth.ts`'s `OAuthRequestError` never embeds the token itself, only the provider's error code/status).
- `buildFailureHandler()` (`lib/jobs/retry.ts:113-140`) fires exactly once, after retries are exhausted or a `NonRetriableError` was thrown, routing to `dead-letter.ts` — unchanged; every real provider inherits this without modification.

New instrumentation this plan adds: a `provider.retry.classification_mismatch` counter, incremented if a provider service's own quota/permission mapping (§4.3) disagrees with what the generic HTTP-status rule would have produced — a canary metric to catch a provider changing its error-response shape (e.g., Google changing Gmail's quota error from 403 to 429 in a future API version) before it silently degrades into wrongly-permanent classifications again.
