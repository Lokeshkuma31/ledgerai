# Security Header Strategy

## Mechanism: `middleware.ts`, not `next.config.ts`

Headers are applied in `middleware.ts` rather than via `next.config.ts`'s `headers()` function, for two reasons: (1) it's the single place every request already passes through (session check, rate limiting), so headers are guaranteed to apply consistently including to redirects and error responses, which `next.config.ts` headers can miss for certain response types; (2) it keeps the security surface in one reviewable file rather than split across two config mechanisms. A helper, `applySecurityHeaders(response)`, is called on every `NextResponse` the middleware produces (the pass-through, the rate-limit 429, and the sign-in redirect).

## Header-by-header design

| Header | Value | Rationale |
|---|---|---|
| `Content-Security-Policy` | See below | Primary defense-in-depth against XSS — the app has no sanitization audit performed (out of scope for this pass), so CSP is the backstop if one is ever missed. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Vercel always serves production over TLS; HSTS is harmless to send over local HTTP dev (browsers ignore it on non-HTTPS responses) and closes the downgrade-attack window in production. Two-year max-age + preload is the standard "serious about it" configuration. |
| `X-Frame-Options` | `DENY` | The app has no legitimate reason to be iframed by anyone, including itself — this is a financial dashboard with destructive actions (disconnect, delete) reachable by simple clicks; clickjacking is a real risk without it. |
| `X-Content-Type-Options` | `nosniff` | Standard MIME-sniffing protection, zero downside. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Avoids leaking full URLs (which can contain OAuth `state`/`code` query params during the connect flow, or connection IDs in future deep links) to third-party `Referer` headers, while still sending useful same-origin/downgrade-safe referrer info. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=()` | The app doesn't use any of these browser capabilities; explicitly disabling them removes attack surface (e.g., a compromised third-party script trying to access the camera) at zero functional cost. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolates the app's browsing context from popups/tabs it opens (relevant here: OAuth flows are full-page redirects, not popups, so this doesn't interfere with Connection Hub or Better Auth sign-in) and mitigates cross-origin window-reference attacks (e.g., Spectre-class side channels, `window.opener` manipulation). Safe to apply unconditionally since the app never relies on `window.opener` access from an external site. |

### Content-Security-Policy — the one requiring judgment calls

```
default-src 'self';
script-src 'self' 'unsafe-inline'{{ dev: " 'unsafe-eval'" }};
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self'{{ dev: " ws://localhost:* http://localhost:*" }};
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
```

- **`script-src 'unsafe-inline'`** is a deliberate, documented tradeoff, not an oversight: Next.js App Router injects inline `<script>` tags for RSC hydration payloads, and a nonce-based CSP (the strict alternative) requires wiring a per-request nonce through `next.config.ts` and every layout, which risks breaking rendering in ways that are hard to fully verify without an extended interactive QA pass across every route. Shipping a working CSP now (blocking third-party/injected script origins, which is the actual attacker-facing win) is preferred over blocking on a stricter nonce-based version. **This is the one item in this strategy explicitly flagged as a fast-follow**, not a final state — tracked as a follow-up once nonce-based CSP can be verified route-by-route.
- **`img-src ... https:`** is broader than strict `'self'` because OAuth-connected accounts carry a provider-hosted avatar (`session.user.image`, sourced from Google/Microsoft/Yahoo profile data) — restricting to `'self'` would silently break avatar rendering. Scoped to `https:` rather than wildcarding all protocols.
- **`connect-src 'self'`** is intentionally *not* broadened for the AI provider (Anthropic/OpenAI/etc.) — all LLM calls happen server-side (`lib/ai/provider.ts`, called from Server Actions), never as a client-side `fetch`, so the browser never needs to reach an external AI API directly.
- **dev-only additions** (`'unsafe-eval'`, localhost `ws:`/`http:` in `connect-src`) are gated on `process.env.NODE_ENV !== "production"` — Next.js dev mode's Fast Refresh and HMR websocket need them; production omits both.

### Cross-Origin-Embedder-Policy — deliberately not applied globally

COEP (`require-corp` or `credentialless`) is **not** set in this pass. Reasoning: COEP's purpose is enabling cross-origin isolation (required for `SharedArrayBuffer`, high-resolution timers, and similar capabilities) — this app uses none of them today. Applying `require-corp` would require every cross-origin resource the app loads (notably OAuth-provider avatar images via `img-src https:` above) to serve `Cross-Origin-Resource-Policy` headers, which Google/Microsoft/Yahoo avatar CDNs are not guaranteed to do — enabling it today would risk silently breaking avatar rendering with no corresponding security benefit, since there's no cross-origin-isolation-dependent feature to protect. **If a future feature needs cross-origin isolation** (e.g., in-browser heavy computation via `SharedArrayBuffer`, or a WASM-based feature), apply `Cross-Origin-Embedder-Policy: credentialless` rather than `require-corp` — `credentialless` still isolates the context but drops credentials on cross-origin subresource requests instead of requiring those resources to opt in via CORP, which is the safer choice for an app that doesn't control the headers of every third-party image it loads.

## Verification plan

After implementation: load every route class (public sign-in page, authenticated dashboard, the Connection Hub OAuth redirect round-trip end-to-end against real Google/Microsoft/Yahoo test apps, document upload) in a real browser and confirm zero CSP console violations and that OAuth redirects complete successfully (CSP's `form-action`/`frame-ancestors` directives are the ones most likely to interact with a redirect-heavy OAuth flow — confirmed above that full-page redirects, not iframes or form-posts to third parties, are how this app's OAuth works, so neither directive should interfere).
