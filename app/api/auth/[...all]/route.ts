import { NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/better-auth";
import { authRateLimit } from "@/lib/cache/redis";
import { getClientIp } from "@/lib/http/client-ip";
import { recordAuditEvent } from "@/lib/audit/log";

export const runtime = "nodejs";

// middleware.ts deliberately excludes /api/auth from its generic rate
// limiter (Better Auth was assumed to throttle itself internally — an
// assumption this pass found was never actually verified against
// lib/auth/better-auth.ts's config). This wrapper makes the app's own
// protection unconditional regardless of what Better Auth does
// internally — see docs/security-hardening/02-authorization-audit.md.
// IP-keyed since sign-in/sign-up requests have no session yet.
const handlers = toNextJsHandler(auth);

async function rateLimitOrNull(request: Request): Promise<Response | null> {
  const ip = getClientIp(request);
  const { success } = await authRateLimit.limit(ip);
  if (success) return null;
  await recordAuditEvent({ action: "security.rate_limited", entityType: "auth", entityId: ip, ip });
  return NextResponse.json(
    { error: { code: "RATE_LIMITED", message: "Too many requests — try again shortly." } },
    { status: 429 },
  );
}

export async function GET(request: Request) {
  return (await rateLimitOrNull(request)) ?? handlers.GET(request);
}

export async function POST(request: Request) {
  return (await rateLimitOrNull(request)) ?? handlers.POST(request);
}
