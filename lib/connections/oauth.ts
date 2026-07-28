/**
 * OAuth Flow Implementation — provider-agnostic Authorization Code + PKCE
 * mechanics (RFC 6749 + RFC 7636). providers.ts supplies each provider's
 * own endpoints/client credentials/field names; this file never hardcodes
 * a provider-specific URL or scope. Every HTTP call here is server-only
 * (`fetch` to a provider's real token/userinfo endpoint) — no client
 * secret is ever constructed anywhere but here, and never returned to a
 * caller outside lib/connections/.
 */
import crypto from "node:crypto";

export interface OAuthEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  /** Not every provider supports programmatic revocation (Yahoo doesn't
   * publish one) — disconnect() falls back to simply discarding the
   * locally-held token when this is absent. */
  revocationEndpoint?: string;
}

export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
}

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** RFC 7636 S256 — a fresh, unpredictable verifier per attempt, discarded
 * after single use by session.ts's cookie. */
export function generatePKCEPair(): PKCEPair {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

/** CSRF protection for the redirect round-trip — compared against the
 * value the provider echoes back on its callback redirect. */
export function generateState(): string {
  return base64url(crypto.randomBytes(24));
}

export function buildAuthorizationUrl(
  endpoints: OAuthEndpoints,
  params: { clientId: string; redirectUri: string; state: string; codeChallenge: string; scopes: string[] },
): string {
  const url = new URL(endpoints.authorizationEndpoint);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", params.scopes.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline"); // Google: request a refresh_token
  url.searchParams.set("prompt", "consent"); // Google: force refresh_token issuance on repeat connects
  return url.toString();
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  tokenType: string;
  scope: string | null;
}

class OAuthRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}
export { OAuthRequestError };

function parseErrorCode(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    // not JSON — fall through to a status-derived code
  }
  return status === 401 || status === 403 ? "invalid_grant" : "request_failed";
}

async function postForm(endpoint: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new OAuthRequestError(`Token request failed (${response.status}): ${text}`, parseErrorCode(response.status, text));
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function toTokenResponse(json: Record<string, unknown>): TokenResponse {
  return {
    accessToken: String(json.access_token ?? ""),
    refreshToken: json.refresh_token ? String(json.refresh_token) : null,
    expiresIn: Number(json.expires_in ?? 3600),
    tokenType: String(json.token_type ?? "Bearer"),
    scope: json.scope ? String(json.scope) : null,
  };
}

export async function exchangeCodeForTokens(
  endpoints: OAuthEndpoints,
  params: { clientId: string; clientSecret: string; code: string; redirectUri: string; codeVerifier: string },
): Promise<TokenResponse> {
  const json = await postForm(endpoints.tokenEndpoint, {
    grant_type: "authorization_code",
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });
  return toTokenResponse(json);
}

export async function refreshAccessToken(
  endpoints: OAuthEndpoints,
  params: { clientId: string; clientSecret: string; refreshToken: string },
): Promise<TokenResponse> {
  const json = await postForm(endpoints.tokenEndpoint, {
    grant_type: "refresh_token",
    client_id: params.clientId,
    client_secret: params.clientSecret,
    refresh_token: params.refreshToken,
  });
  // A refresh response may omit refresh_token (most providers reissue the
  // same one) — callers must keep the prior value when this is null.
  return toTokenResponse(json);
}

export async function revokeToken(endpoints: OAuthEndpoints, token: string): Promise<void> {
  if (!endpoints.revocationEndpoint) return;
  await fetch(endpoints.revocationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  }).catch(() => {
    // Best-effort: the connection is disconnected locally either way —
    // an unreachable revocation endpoint must never block disconnect().
  });
}

export interface RawUserInfo {
  id: string;
  email: string;
  name: string;
}

export async function fetchUserInfo(userInfoEndpoint: string, accessToken: string): Promise<Record<string, unknown>> {
  const response = await fetch(userInfoEndpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    throw new OAuthRequestError(`User info request failed (${response.status})`, response.status === 401 ? "invalid_grant" : "request_failed");
  }
  return (await response.json()) as Record<string, unknown>;
}
