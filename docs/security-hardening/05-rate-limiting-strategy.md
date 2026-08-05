# Rate Limiting Strategy

## New finding from this pass: Server Actions bypass rate limiting entirely today

`middleware.ts`'s `needsRateLimit()` only matches `pathname.startsWith("/api/")`. Next.js Server Actions are invoked as POST requests to the *originating page route* (e.g., a POST to `/connections` carrying a `Next-Action` header) — **they never match that prefix**, so the existing generic `apiRateLimit` never applies to them. Combined with Finding 1 in the [IDOR report](./03-idor-verification-report.md), the four Connection Hub Server Actions currently have zero rate limiting of any kind. This reshapes the strategy below: middleware alone cannot cover Server Actions, so each sensitive Server Action must call a limiter directly.

## Limiter inventory

All limiters are Upstash `Ratelimit` instances (matching the existing `apiRateLimit` pattern in `lib/cache/redis.ts`), each with its own key prefix so buckets never collide, and each keyed by the most specific stable identifier available at that call site (session userId where authenticated, IP where not).

| Limiter | Applies to | Key | Threshold | Window | Rationale |
|---|---|---|---|---|---|
| `apiRateLimit` (existing, unchanged) | All `/api/*` except `/api/auth` | session token or IP | 60 requests | 60s | Baseline, already shipped — kept as the floor for everything not covered below. |
| `authRateLimit` | `/api/auth/*` (wraps better-auth's handler) | IP | 10 requests | 60s | Login/sign-up/password-reset are brute-force and enumeration targets; IP-keyed since there's no session yet at this layer. Tighter than the generic limit because credential-guessing attacks send many requests per second, not per minute. |
| `oauthCallbackRateLimit` | `/api/connections/[provider]/authorize` and `/callback` | IP | 15 requests | 60s | OAuth redirect abuse (replaying/forging callback requests, hammering the authorize redirect) — looser than auth login since legitimate multi-provider connection flows in quick succession are plausible (a user connecting Gmail, then Outlook, then Yahoo in one sitting), but still bounded well below what only a script would need. |
| `uploadRateLimit` | `/api/documents/upload` | userId | 20 requests | 60s | Presigned-URL issuance has a real cost (R2 storage, egress on download) and is the one endpoint that turns request volume directly into infrastructure spend — tighter than generic API traffic. |
| `connectionMutationRateLimit` | The 4 Connection Hub Server Actions (`disconnect`/`refresh`/`rename`/`health-check`) | userId (now resolvable — see [P1](./01-remediation-plan.md)) | 20 requests | 60s | Closes the Server-Action gap above. A legitimate user rarely disconnects/renames/refreshes more than a handful of times per session; 20/min comfortably covers rapid manual retries while blocking scripted abuse (e.g., a compromised session hammering `refreshConnectionAction` to burn through a victim's provider API quota, relevant once Finding 1 is fixed and ownership is enforced but before assuming good faith on request *volume*). |
| `searchRateLimit` (designed, not yet wired — no search API route exists) | Future search endpoint | userId | 30 requests | 60s | Search is typically higher-frequency (debounced keystroke-driven) than mutation actions but still bounded — 30/min accommodates realistic interactive use while blocking scraping. Documented here so it's applied on day one when a search route is built, not retrofitted later. |
| `importRateLimit` (designed, not yet wired — no import API route exists) | Future bulk-import endpoint (`app/(app)/settings/import` is currently a page, not an API route) | userId | 5 requests | 300s (5 min) | Import operations are typically expensive (parsing, DB writes, possibly OCR/LLM calls) — a much tighter, longer-window limit than any other category, sized around "a user doing a real bulk import a few times while testing/correcting mistakes," not repeated automated triggering. |

The last two are specified now, per the requirement to cover "import endpoints, search," but **not implemented in this pass** since implementing them would mean creating new API routes — out of scope per "no feature additions." They're documented so whoever builds those routes wires the limiter in from the start rather than shipping unprotected and fixing it later, which is exactly the pattern this whole engagement exists to correct.

## Server Action limiting mechanism

Since middleware can't see Server Actions, `connectionMutationRateLimit.limit(userId)` is called as the **first line** inside each of the four functions in `lib/connections/actions.ts`, before the (now-added) ownership check — cheap Redis round-trip, fails closed with a `RateLimitedError` that the existing `withBusy`/`handleActionError` client-side pattern already surfaces as `error.message` with zero UI changes required (verified against `components/ProviderCard.tsx`'s existing catch-and-display pattern).

## `/api/auth/*` wrapper mechanism

`app/api/auth/[...all]/route.ts` currently just re-exports better-auth's handler (`toNextJsHandler(auth)`). The fix wraps both exported methods: resolve the client IP, call `authRateLimit.limit(ip)`, return 429 via the same `{ error: { code, message } }` shape as `handleApiError` on failure, otherwise delegate to the original better-auth handler unchanged. This closes the specific gap flagged in [02](./02-authorization-audit.md) — the assumption that better-auth self-throttles was never verified, so this makes the app's own protection unconditional regardless of what better-auth does internally.

## Penalty window design

All windows use Upstash's sliding-window algorithm (matching the existing `apiRateLimit`) rather than fixed-window, specifically because fixed windows allow a burst of `2 × limit` requests across a window boundary (e.g., 60 requests in the last second of one window plus 60 in the first second of the next) — sliding window closes that gap with negligible added cost via the same SDK already in use. No separate "penalty" (e.g., escalating lockout after repeated violations) is implemented in this pass — a 429 with a fixed window is the entire mechanism; adding progressive penalties/lockout is a reasonable future enhancement but adds state-management complexity (tracking violation history) not justified for this pass's scope.

## Verification plan

Each new limiter gets a focused unit test asserting the Nth+1 request within a window is rejected (mirroring how `apiRateLimit` itself would be tested, using a real/test Upstash database the way `lib/connections/__tests__/engine.test.ts` already does against real Postgres) — added as part of Priority 3 implementation, not deferred.
