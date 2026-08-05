import { NextResponse } from "next/server";
import { isConnectionOwnedBy, startConnection } from "@/lib/connections/engine";
import { createOAuthSessionCookie } from "@/lib/connections/session";
import { getCurrentUserId } from "@/lib/auth/session";
import { oauthCallbackRateLimit } from "@/lib/cache/redis";
import { getClientIp } from "@/lib/http/client-ip";
import { recordAuditEvent } from "@/lib/audit/log";
import { PROVIDER_IDS, type ProviderId } from "@/lib/connections/types";

// AES/GCM (token-manager.ts) and the file-backed registry (registry.ts)
// both need Node APIs unavailable on the Edge runtime.
export const runtime = "nodejs";

function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * Starts a Connect (or, with `?reconnect=<id>`, a Reconnect): builds the
 * provider's real authorization URL, stashes the CSRF state + PKCE
 * verifier in a short-lived cookie, and redirects the browser to the
 * provider's consent screen. No token exists yet at this point — nothing
 * this route does touches token material at all.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);

  const ip = getClientIp(request);
  const { success } = await oauthCallbackRateLimit.limit(ip);
  if (!success) {
    await recordAuditEvent({ action: "security.rate_limited", entityType: "connection", entityId: ip, ip });
    return NextResponse.redirect(new URL(`/connections?error=${encodeURIComponent("Too many requests — try again shortly.")}`, url.origin));
  }

  if (!isProviderId(provider)) {
    return NextResponse.redirect(new URL("/connections?error=unknown-provider", url.origin));
  }

  const requestedReconnectId = url.searchParams.get("reconnect") ?? undefined;
  let reconnectId: string | undefined;
  if (requestedReconnectId) {
    // A Reconnect must belong to the caller — resolved and checked here,
    // before the id is even allowed into the short-lived OAuth session
    // cookie, rather than trusting the callback route to catch it later
    // (which it also independently does — see engine.ts's completeConnection).
    // See docs/security-hardening/03-idor-verification-report.md, Finding 2.
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.redirect(new URL(`/sign-in?redirect=/connections`, url.origin));
    }
    const owned = await isConnectionOwnedBy(requestedReconnectId, userId);
    if (!owned) {
      await recordAuditEvent({
        action: "connection.access_denied",
        entityType: "connection",
        entityId: requestedReconnectId,
        userId,
        ip,
      });
      return NextResponse.redirect(
        new URL(`/connections?error=${encodeURIComponent("Connection not found.")}&provider=${provider}`, url.origin),
      );
    }
    reconnectId = requestedReconnectId;
  }

  const redirectUri = `${url.origin}/api/connections/${provider}/callback`;

  let start;
  try {
    start = startConnection(provider, redirectUri);
  } catch (error) {
    const message = error instanceof Error ? error.message : "This provider is not configured.";
    return NextResponse.redirect(new URL(`/connections?error=${encodeURIComponent(message)}&provider=${provider}`, url.origin));
  }

  await createOAuthSessionCookie({
    provider,
    state: start.state,
    codeVerifier: start.codeVerifier,
    reconnectId,
    redirectAfter: "/connections",
  });

  return NextResponse.redirect(start.authorizationUrl);
}
