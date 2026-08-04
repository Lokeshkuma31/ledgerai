import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { apiRateLimit } from "@/lib/cache/redis";

// Fast, Edge-compatible presence check only (no DB round-trip) — the
// actual session is validated server-side via lib/auth/session.ts wherever
// a page/action/route needs the real user id. This just keeps signed-out
// visitors out of the dashboard and out of the Connection Hub's OAuth
// flow, both of which now require a resolvable userId.
const PROTECTED_PATHS = ["/dashboard", "/transactions", "/budgets", "/goals", "/forecast", "/insights", "/merchants", "/recurring", "/feed", "/search", "/ai-coach", "/analytics", "/banks", "/documents", "/email", "/sync", "/workflows", "/plugins", "/connections", "/settings"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) || pathname.startsWith("/api/connections/");
}

// General API rate limiting (plan §7) — dedicated, tighter limiters for
// sensitive endpoints (OAuth, document upload, AI Coach chat) are future,
// separate work; this is just the baseline every /api/* route gets.
// Excludes /api/auth (Better Auth handles its own throttling).
function needsRateLimit(pathname: string): boolean {
  return pathname.startsWith("/api/") && !pathname.startsWith("/api/auth");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (needsRateLimit(pathname)) {
    // Middleware can't afford a DB round-trip to resolve the real userId
    // (see the presence-check comment above), so the session cookie's
    // token stands in as a per-session identity key when present — closer
    // to "userId" than a shared IP would be, without a DB call. Falls back
    // to IP for unauthenticated requests.
    const identifier =
      getSessionCookie(request) ?? request.headers.get("x-forwarded-for") ?? "anonymous";
    const { success } = await apiRateLimit.limit(identifier);
    if (!success) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests." } },
        { status: 429 },
      );
    }
  }

  if (!isProtected(pathname)) return NextResponse.next();

  const sessionToken = getSessionCookie(request);
  if (!sessionToken) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|favicon.ico|api/auth).*)",
  ],
};
