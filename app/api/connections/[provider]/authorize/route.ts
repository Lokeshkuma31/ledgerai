import { NextResponse } from "next/server";
import { startConnection } from "@/lib/connections/engine";
import { createOAuthSessionCookie } from "@/lib/connections/session";
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

  if (!isProviderId(provider)) {
    return NextResponse.redirect(new URL("/connections?error=unknown-provider", url.origin));
  }

  const reconnectId = url.searchParams.get("reconnect") ?? undefined;
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
