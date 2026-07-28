import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.CONNECTION_HUB_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-client-secret";
process.env.MICROSOFT_OAUTH_CLIENT_ID = "microsoft-client-id";
process.env.MICROSOFT_OAUTH_CLIENT_SECRET = "microsoft-client-secret";
process.env.YAHOO_OAUTH_CLIENT_ID = "yahoo-client-id";
process.env.YAHOO_OAUTH_CLIENT_SECRET = "yahoo-client-secret";

import { completeConnection, disconnectConnection, getConnections, refreshConnection, startConnection } from "@/lib/connections/engine";
import { clearConnectionRegistry, getStoredConnection } from "@/lib/connections/registry";
import type { ProviderId } from "@/lib/connections/types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface Route {
  match: (url: string) => boolean;
  response: () => Response;
}

function installFetchMock(routes: Route[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      const route = routes.find((r) => r.match(url));
      if (!route) throw new Error(`Unmocked fetch in test: ${url}`);
      return route.response();
    }),
  );
}

function tokenAndUserInfoRoutes(tokenBody: Record<string, unknown>, tokenStatus: number, userInfoBody: Record<string, unknown>): Route[] {
  return [
    { match: (u) => u.includes("token") || u.includes("get_token"), response: () => jsonResponse(tokenBody, tokenStatus) },
    { match: (u) => u.includes("userinfo") || u.includes("/me"), response: () => jsonResponse(userInfoBody) },
    { match: (u) => u.includes("revoke"), response: () => jsonResponse({}) },
  ];
}

async function connectProvider(provider: ProviderId, tokenBody: Record<string, unknown>, userInfoBody: Record<string, unknown>) {
  installFetchMock(tokenAndUserInfoRoutes(tokenBody, 200, userInfoBody));
  const start = startConnection(provider, `https://app.example/api/connections/${provider}/callback`);
  return completeConnection({
    providerId: provider,
    code: "auth-code",
    codeVerifier: start.codeVerifier,
    redirectUri: `https://app.example/api/connections/${provider}/callback`,
  });
}

describe("Connection Hub engine", () => {
  beforeEach(() => {
    clearConnectionRegistry();
    vi.unstubAllGlobals();
  });

  it("Google OAuth success flow: completes the code exchange and creates a healthy connection", async () => {
    const record = await connectProvider(
      "google",
      { access_token: "g-at-1", refresh_token: "g-rt-1", expires_in: 3600, token_type: "Bearer", scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly" },
      { sub: "google-uid-1", email: "person@gmail.com", name: "Person" },
    );

    expect(record.provider).toBe("google");
    expect(record.email).toBe("person@gmail.com");
    expect(record.status).toBe("connected");
    expect(record.health.status).toBe("healthy");
    expect(record.scopes).toContain("https://www.googleapis.com/auth/gmail.readonly");

    // The public record never carries token material in any form.
    expect(JSON.stringify(record)).not.toContain("g-at-1");
    expect(JSON.stringify(record)).not.toContain("g-rt-1");

    // The server-only stored record holds only encrypted ciphertext.
    const stored = getStoredConnection(record.id)!;
    expect(stored.tokens?.accessToken.ciphertext).toBeTruthy();
    expect(stored.tokens?.accessToken.ciphertext).not.toContain("g-at-1");
  });

  it("Google token refresh: issues a new access token and extends expiry", async () => {
    const record = await connectProvider(
      "google",
      { access_token: "g-at-1", refresh_token: "g-rt-1", expires_in: 60, token_type: "Bearer" },
      { sub: "google-uid-1", email: "person@gmail.com", name: "Person" },
    );

    installFetchMock([{ match: (u) => u.includes("token"), response: () => jsonResponse({ access_token: "g-at-2", expires_in: 3600, token_type: "Bearer" }) }]);
    const refreshed = await refreshConnection(record.id);

    expect(refreshed.status).toBe("connected");
    expect(refreshed.health.status).toBe("healthy");
    expect(new Date(refreshed.tokenExpiresAt!).getTime()).toBeGreaterThan(new Date(record.tokenExpiresAt!).getTime());
  });

  it("Microsoft OAuth success flow", async () => {
    const record = await connectProvider(
      "microsoft",
      { access_token: "m-at-1", refresh_token: "m-rt-1", expires_in: 3600, token_type: "Bearer", scope: "openid email profile offline_access Mail.Read" },
      { id: "ms-uid-1", mail: "person@outlook.com", displayName: "Person" },
    );
    expect(record.provider).toBe("microsoft");
    expect(record.email).toBe("person@outlook.com");
    expect(record.status).toBe("connected");
  });

  it("Yahoo OAuth success flow", async () => {
    const record = await connectProvider(
      "yahoo",
      { access_token: "y-at-1", refresh_token: "y-rt-1", expires_in: 3600, token_type: "Bearer", scope: "openid email profile" },
      { sub: "yahoo-uid-1", email: "person@yahoo.com", name: "Person" },
    );
    expect(record.provider).toBe("yahoo");
    expect(record.email).toBe("person@yahoo.com");
    expect(record.status).toBe("connected");
  });

  it("Revoked permission detection: a refresh failing with invalid_grant marks the connection permission-revoked", async () => {
    const record = await connectProvider(
      "google",
      { access_token: "g-at-1", refresh_token: "g-rt-1", expires_in: 3600, token_type: "Bearer" },
      { sub: "google-uid-1", email: "person@gmail.com", name: "Person" },
    );

    installFetchMock([{ match: (u) => u.includes("token"), response: () => jsonResponse({ error: "invalid_grant" }, 400) }]);
    await expect(refreshConnection(record.id)).rejects.toThrow();

    const stored = getStoredConnection(record.id)!;
    expect(stored.status).toBe("permission-revoked");
    expect(stored.health.status).toBe("permission-revoked");
  });

  it("Authentication failure scenarios: a failed authorization-code exchange never creates a connection", async () => {
    installFetchMock([{ match: (u) => u.includes("token"), response: () => jsonResponse({ error: "invalid_grant" }, 400) }]);
    const start = startConnection("google", "https://app.example/api/connections/google/callback");

    await expect(
      completeConnection({ providerId: "google", code: "bad-code", codeVerifier: start.codeVerifier, redirectUri: "https://app.example/api/connections/google/callback" }),
    ).rejects.toThrow();
    expect(getConnections()).toHaveLength(0);
  });

  it("Reconnect flow: completing a connection with existingConnectionId updates the same record in place", async () => {
    const first = await connectProvider(
      "google",
      { access_token: "g-at-1", refresh_token: "g-rt-1", expires_in: 3600, token_type: "Bearer" },
      { sub: "google-uid-1", email: "person@gmail.com", name: "Person" },
    );

    installFetchMock(
      tokenAndUserInfoRoutes(
        { access_token: "g-at-2", refresh_token: "g-rt-2", expires_in: 3600, token_type: "Bearer" },
        200,
        { sub: "google-uid-1", email: "person@gmail.com", name: "Person" },
      ),
    );
    const start = startConnection("google", "https://app.example/api/connections/google/callback");
    const reconnected = await completeConnection({
      providerId: "google",
      code: "auth-code-2",
      codeVerifier: start.codeVerifier,
      redirectUri: "https://app.example/api/connections/google/callback",
      existingConnectionId: first.id,
    });

    expect(reconnected.id).toBe(first.id);
    expect(getConnections()).toHaveLength(1);
    expect(reconnected.history.at(-1)?.type).toBe("reconnected");
  });

  it("Disconnect flow: revokes and wipes token material, marking the connection disconnected", async () => {
    const record = await connectProvider(
      "google",
      { access_token: "g-at-1", refresh_token: "g-rt-1", expires_in: 3600, token_type: "Bearer" },
      { sub: "google-uid-1", email: "person@gmail.com", name: "Person" },
    );

    installFetchMock([{ match: (u) => u.includes("revoke"), response: () => jsonResponse({}) }]);
    const disconnected = await disconnectConnection(record.id);

    expect(disconnected?.status).toBe("disconnected");
    expect(disconnected?.health.status).toBe("disconnected");
    const stored = getStoredConnection(record.id)!;
    expect(stored.tokens).toBeNull();
  });
});
