import { NextResponse } from "next/server";
import { completeConnection } from "@/lib/connections/engine";
import { readAndClearOAuthSessionCookie } from "@/lib/connections/session";
import { PROVIDER_IDS, type ProviderId } from "@/lib/connections/types";

export const runtime = "nodejs";

function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * The single server-side OAuth callback handler every provider redirects
 * back to. Validates the `state` param against the cookie set by the
 * authorize route (CSRF protection), exchanges the authorization code for
 * tokens via engine.completeConnection(), and redirects the browser back
 * into the app — never rendering or returning a token to the client in
 * any form, including in the redirect URL itself.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const origin = url.origin;

  const session = await readAndClearOAuthSessionCookie();

  const providerError = url.searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(new URL(`/connections?error=${encodeURIComponent(providerError)}&provider=${provider}`, origin));
  }

  if (!isProviderId(provider) || !session || session.provider !== provider) {
    return NextResponse.redirect(
      new URL(`/connections?error=${encodeURIComponent("Connection session expired or invalid — please try again.")}&provider=${provider}`, origin),
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || state !== session.state) {
    return NextResponse.redirect(
      new URL(`/connections?error=${encodeURIComponent("The connection request could not be verified — please try again.")}&provider=${provider}`, origin),
    );
  }

  try {
    await completeConnection({
      providerId: provider,
      code,
      codeVerifier: session.codeVerifier,
      redirectUri: `${origin}/api/connections/${provider}/callback`,
      existingConnectionId: session.reconnectId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed.";
    return NextResponse.redirect(new URL(`/connections?error=${encodeURIComponent(message)}&provider=${provider}`, origin));
  }

  return NextResponse.redirect(new URL(`${session.redirectAfter}?connected=${provider}`, origin));
}
