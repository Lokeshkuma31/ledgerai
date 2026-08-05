import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { apiRateLimit } from "@/lib/cache/redis";

// Correlation ID minting/propagation (docs/observability/09-correlation-id-strategy.md).
// middleware.ts runs on the Edge runtime by default, which doesn't support
// node:async_hooks — so this deliberately does NOT import
// lib/observability/context.ts (AsyncLocalStorage-based, Node-only).
// Minting here only needs Web Crypto's randomUUID(), available on both
// Edge and Node; downstream Route Handlers/Server Actions read the
// propagated x-correlation-id header via next/headers and enter their own
// AsyncLocalStorage context from it.
function getOrMintCorrelationId(request: NextRequest): string {
  return request.headers.get("x-correlation-id") ?? `corr_${crypto.randomUUID()}`;
}

// Fast, Edge-compatible presence check only (no DB round-trip) — the
// actual session is validated server-side via lib/auth/session.ts wherever
// a page/action/route needs the real user id. This just keeps signed-out
// visitors out of the dashboard and out of the Connection Hub's OAuth
// flow, both of which now require a resolvable userId.
const PROTECTED_PATHS = ["/dashboard", "/transactions", "/budgets", "/goals", "/forecast", "/insights", "/merchants", "/recurring", "/feed", "/search", "/ai-coach", "/analytics", "/banks", "/documents", "/email", "/sync", "/workflows", "/plugins", "/connections", "/settings"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) || pathname.startsWith("/api/connections/");
}

// General API rate limiting (plan §7) — the floor every /api/* route gets.
// Dedicated, tighter limiters for sensitive endpoints (auth, OAuth,
// document upload, Connection Hub Server Actions) are now applied directly
// at each of those call sites (lib/cache/redis.ts's authRateLimit /
// oauthCallbackRateLimit / uploadRateLimit / connectionMutationRateLimit)
// rather than here — Server Actions in particular never match the
// /api/* prefix this middleware scopes to, so they can only be rate-
// limited at the point they're defined. See
// docs/security-hardening/05-rate-limiting-strategy.md. /api/auth is
// still excluded here since its own dedicated wrapper
// (app/api/auth/[...all]/route.ts) applies authRateLimit unconditionally.
function needsRateLimit(pathname: string): boolean {
  return pathname.startsWith("/api/") && !pathname.startsWith("/api/auth");
}

function getClientIdentifier(request: NextRequest): string {
  const sessionToken = getSessionCookie(request);
  if (sessionToken) return sessionToken;
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "anonymous";
}

// Security response headers — applied to every response this middleware
// produces (pass-through, rate-limit rejections, sign-in redirects) so
// coverage is unconditional rather than route-by-route. See
// docs/security-hardening/04-security-header-strategy.md for the
// rationale behind each value, including why CSP still allows
// 'unsafe-inline' for scripts (Next.js App Router RSC hydration) and why
// Cross-Origin-Embedder-Policy is deliberately not set.
const isProd = process.env.NODE_ENV === "production";

function buildCsp(): string {
  const scriptSrc = isProd ? "'self' 'unsafe-inline'" : "'self' 'unsafe-inline' 'unsafe-eval'";
  const connectSrc = isProd ? "'self'" : "'self' ws://localhost:* http://localhost:*";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

const CSP = buildCsp();

function applySecurityHeaders(response: NextResponse, correlationId: string): NextResponse {
  response.headers.set("Content-Security-Policy", CSP);
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  // Echoed on every response so a client-side error report can be matched
  // to server-side logs without the user needing to know what a trace id
  // is — see docs/observability/09-correlation-id-strategy.md.
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

/** Forwards the correlation id to the Route Handler/Server Action this
 * request reaches, via a request header downstream code reads through
 * next/headers — the only propagation path available from Edge
 * middleware into Node-runtime handlers (see the getOrMintCorrelationId
 * comment above). */
function withCorrelationHeader(request: NextRequest, correlationId: string): Headers {
  const headers = new Headers(request.headers);
  headers.set("x-correlation-id", correlationId);
  return headers;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const correlationId = getOrMintCorrelationId(request);
  const forwardedHeaders = withCorrelationHeader(request, correlationId);

  if (needsRateLimit(pathname)) {
    const identifier = getClientIdentifier(request);
    const { success } = await apiRateLimit.limit(identifier);
    if (!success) {
      return applySecurityHeaders(
        NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many requests." } }, { status: 429 }),
        correlationId,
      );
    }
  }

  if (!isProtected(pathname)) {
    return applySecurityHeaders(NextResponse.next({ request: { headers: forwardedHeaders } }), correlationId);
  }

  const sessionToken = getSessionCookie(request);
  if (!sessionToken) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect", pathname);
    return applySecurityHeaders(NextResponse.redirect(signInUrl), correlationId);
  }

  return applySecurityHeaders(NextResponse.next({ request: { headers: forwardedHeaders } }), correlationId);
}

export const config = {
  matcher: [
    "/((?!_next|favicon.ico|api/auth).*)",
  ],
};
