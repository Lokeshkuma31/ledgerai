import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAuthorizationUrl, exchangeCodeForTokens, fetchUserInfo, generatePKCEPair, generateState, refreshAccessToken, revokeToken } from "@/lib/connections/oauth";

const ENDPOINTS = {
  authorizationEndpoint: "https://example.com/authorize",
  tokenEndpoint: "https://example.com/token",
  userInfoEndpoint: "https://example.com/userinfo",
  revocationEndpoint: "https://example.com/revoke",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PKCE + state", () => {
  it("generates a code_verifier and a matching S256 code_challenge, unique per call", () => {
    const a = generatePKCEPair();
    const b = generatePKCEPair();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
    expect(a.codeVerifier.length).toBeGreaterThan(20);
  });

  it("generates a unique CSRF state per call", () => {
    expect(generateState()).not.toBe(generateState());
  });
});

describe("buildAuthorizationUrl", () => {
  it("includes every required Authorization Code + PKCE parameter", () => {
    const url = new URL(
      buildAuthorizationUrl(ENDPOINTS, { clientId: "cid", redirectUri: "https://app.example/callback", state: "s1", codeChallenge: "cc1", scopes: ["openid", "email"] }),
    );
    expect(url.origin + url.pathname).toBe("https://example.com/authorize");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email");
    expect(url.searchParams.get("state")).toBe("s1");
    expect(url.searchParams.get("code_challenge")).toBe("cc1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("exchangeCodeForTokens", () => {
  it("POSTs grant_type=authorization_code and parses the token response", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600, token_type: "Bearer", scope: "openid email" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeCodeForTokens(ENDPOINTS, { clientId: "cid", clientSecret: "secret", code: "code1", redirectUri: "https://app.example/callback", codeVerifier: "verifier1" });
    expect(result).toEqual({ accessToken: "at", refreshToken: "rt", expiresIn: 3600, tokenType: "Bearer", scope: "openid email" });

    const [, init] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe("cid");
    expect(body.get("client_secret")).toBe("secret");
    expect(body.get("code")).toBe("code1");
    expect(body.get("code_verifier")).toBe("verifier1");
  });

  it("throws with a parsed error code on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "invalid_grant" }, 400)));
    await expect(
      exchangeCodeForTokens(ENDPOINTS, { clientId: "c", clientSecret: "s", code: "bad", redirectUri: "r", codeVerifier: "v" }),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });
});

describe("refreshAccessToken", () => {
  it("POSTs grant_type=refresh_token with the given refresh token", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => jsonResponse({ access_token: "at2", expires_in: 3600, token_type: "Bearer" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await refreshAccessToken(ENDPOINTS, { clientId: "c", clientSecret: "s", refreshToken: "rt1" });
    expect(result.accessToken).toBe("at2");
    expect(result.refreshToken).toBeNull(); // most providers omit refresh_token on reissue

    const [, init] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt1");
  });
});

describe("fetchUserInfo", () => {
  it("sends a Bearer authorization header and returns the parsed JSON", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => jsonResponse({ sub: "u1", email: "a@b.com" }));
    vi.stubGlobal("fetch", fetchMock);

    const info = await fetchUserInfo(ENDPOINTS.userInfoEndpoint, "token1");
    expect(info).toEqual({ sub: "u1", email: "a@b.com" });

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token1");
  });
});

describe("revokeToken", () => {
  it("never throws, even if the revocation endpoint is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(revokeToken(ENDPOINTS, "token1")).resolves.toBeUndefined();
  });

  it("is a no-op when the provider has no revocation endpoint", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await revokeToken({ ...ENDPOINTS, revocationEndpoint: undefined }, "token1");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
