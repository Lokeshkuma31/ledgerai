/**
 * Provider Implementations — Google (Gmail), Microsoft (Outlook), and
 * Yahoo, each a real OAuth 2.0 Authorization Code + PKCE client against
 * that provider's actual public endpoints (no third-party SDK). Every
 * provider is built by the same factory so the Authorization Code
 * exchange, refresh, disconnect, and health mechanics exist exactly once
 * — each factory call still produces a fully independent object
 * satisfying the ConnectionProvider interface, which is what "Each
 * provider must implement..." asks for; only the endpoints, scopes,
 * credentials, and userinfo field-mapping differ per provider.
 *
 * No client secret is ever hardcoded — every credential is read from an
 * environment variable at call time (see .env.example) and is never
 * logged, returned, or embedded in any object this file exports.
 */
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  fetchUserInfo,
  OAuthRequestError,
  refreshAccessToken,
  revokeToken,
  type OAuthEndpoints,
} from "@/lib/connections/oauth";
import { decryptToken, encryptToken, isExpired, shouldRefresh } from "@/lib/connections/token-manager";
import { isRevocationError } from "@/lib/connections/health";
import { findStoredConnectionByAccount, getStoredConnection, upsertStoredConnection } from "@/lib/connections/registry";
import type {
  ConnectionCapability,
  ConnectionHealth,
  ConnectionHistoryEvent,
  ConnectionProvider,
  OAuthConnectInput,
  ProviderId,
  ProviderMetadata,
  StoredConnection,
  TokenSet,
} from "@/lib/connections/types";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to .env.local — see .env.example.`);
  return value;
}

function pushHistory(history: ConnectionHistoryEvent[], event: ConnectionHistoryEvent): ConnectionHistoryEvent[] {
  return [...history, event].slice(-50);
}

interface ProviderFactoryConfig {
  id: ProviderId;
  name: string;
  endpoints: OAuthEndpoints;
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  defaultScopes: string[];
  capabilities: ConnectionCapability[];
  metadata: ProviderMetadata;
  mapUserInfo: (json: Record<string, unknown>) => { id: string; email: string; name: string };
}

function createProvider(config: ProviderFactoryConfig): ConnectionProvider {
  function credentials() {
    return { clientId: getEnv(config.clientIdEnvVar), clientSecret: getEnv(config.clientSecretEnvVar) };
  }

  async function refreshToken(connectionId: string): Promise<StoredConnection> {
    const existing = await getStoredConnection(connectionId);
    if (!existing) throw new Error(`Connection "${connectionId}" not found.`);
    if (!existing.tokens?.refreshToken) throw new Error("No refresh token on file — reconnect required.");

    const { clientId, clientSecret } = credentials();
    const refreshTokenPlain = decryptToken(existing.tokens.refreshToken);

    try {
      const tokenResponse = await refreshAccessToken(config.endpoints, { clientId, clientSecret, refreshToken: refreshTokenPlain });
      const now = new Date();
      const expiresAt = new Date(now.getTime() + tokenResponse.expiresIn * 1000).toISOString();
      const tokens: TokenSet = {
        accessToken: encryptToken(tokenResponse.accessToken),
        refreshToken: tokenResponse.refreshToken ? encryptToken(tokenResponse.refreshToken) : existing.tokens.refreshToken,
        expiresAt,
        tokenType: tokenResponse.tokenType,
        scopes: existing.tokens.scopes,
      };
      const health: ConnectionHealth = { status: "healthy", message: "Token refreshed.", checkedAt: now.toISOString() };
      const updated: StoredConnection = {
        ...existing,
        status: "connected",
        tokens,
        health,
        lastActivity: now.toISOString(),
        history: pushHistory(existing.history, { type: "token-refreshed", at: now.toISOString(), message: "Access token refreshed." }),
      };
      await upsertStoredConnection(updated);
      return updated;
    } catch (error) {
      const now = new Date().toISOString();
      const code = error instanceof OAuthRequestError ? error.code : "request_failed";
      const revoked = isRevocationError(code);
      const status = revoked ? ("permission-revoked" as const) : ("authentication-failed" as const);
      const updated: StoredConnection = {
        ...existing,
        status,
        health: {
          status,
          message: revoked ? "Refresh failed — access appears to have been revoked." : "Refresh failed — reauthentication required.",
          checkedAt: now,
        },
        lastActivity: now,
        history: pushHistory(existing.history, {
          type: revoked ? "permission-revoked" : "validation-failed",
          at: now,
          message: error instanceof Error ? error.message : "Token refresh failed.",
        }),
      };
      await upsertStoredConnection(updated);
      throw error;
    }
  }

  async function validateConnection(connectionId: string): Promise<boolean> {
    const existing = await getStoredConnection(connectionId);
    if (!existing?.tokens) return false;
    if (isExpired(existing.tokens.expiresAt)) return false;
    try {
      await fetchUserInfo(config.endpoints.userInfoEndpoint, decryptToken(existing.tokens.accessToken));
      return true;
    } catch {
      return false;
    }
  }

  return {
    id: config.id,
    name: config.name,
    version: "1.0.0",
    type: "oauth2",

    buildAuthorizationUrl({ state, codeChallenge, redirectUri }) {
      return buildAuthorizationUrl(config.endpoints, {
        clientId: getEnv(config.clientIdEnvVar),
        redirectUri,
        state,
        codeChallenge,
        scopes: config.defaultScopes,
      });
    },

    async connect(input: OAuthConnectInput): Promise<StoredConnection> {
      const { clientId, clientSecret } = credentials();
      const tokenResponse = await exchangeCodeForTokens(config.endpoints, {
        clientId,
        clientSecret,
        code: input.code,
        redirectUri: input.redirectUri,
        codeVerifier: input.codeVerifier,
      });
      const userInfoJson = await fetchUserInfo(config.endpoints.userInfoEndpoint, tokenResponse.accessToken);
      const { id: providerAccountId, email, name } = config.mapUserInfo(userInfoJson);

      const existing = input.existingConnectionId
        ? await getStoredConnection(input.existingConnectionId)
        : await findStoredConnectionByAccount(input.userId, config.id, providerAccountId);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + tokenResponse.expiresIn * 1000).toISOString();
      const scopes = tokenResponse.scope ? tokenResponse.scope.split(" ") : config.defaultScopes;
      const tokens: TokenSet = {
        accessToken: encryptToken(tokenResponse.accessToken),
        // Some providers omit refresh_token on a re-consent when one was
        // already issued — keep the prior one rather than losing it.
        refreshToken: tokenResponse.refreshToken ? encryptToken(tokenResponse.refreshToken) : (existing?.tokens?.refreshToken ?? null),
        expiresAt,
        tokenType: tokenResponse.tokenType,
        scopes,
      };

      const isReconnect = Boolean(existing);
      const nowIso = now.toISOString();
      const record: StoredConnection = {
        id: existing?.id ?? crypto.randomUUID(),
        userId: input.userId,
        provider: config.id,
        providerAccountId,
        displayName: existing?.displayName || name || email,
        email,
        status: "connected",
        connectedAt: existing?.connectedAt ?? nowIso,
        lastValidated: nowIso,
        lastActivity: nowIso,
        tokens,
        health: { status: "healthy", message: "Connected and validated.", checkedAt: nowIso },
        history: pushHistory(existing?.history ?? [], {
          type: isReconnect ? "reconnected" : "connected",
          at: nowIso,
          message: isReconnect ? "Reconnected." : "Connected.",
        }),
        metadata: existing?.metadata ?? {},
      };

      await upsertStoredConnection(record);
      return record;
    },

    async disconnect(connectionId: string): Promise<void> {
      const existing = await getStoredConnection(connectionId);
      if (!existing) return;

      const tokenToRevoke = existing.tokens?.refreshToken ?? existing.tokens?.accessToken;
      if (tokenToRevoke) {
        await revokeToken(config.endpoints, decryptToken(tokenToRevoke)).catch(() => {});
      }

      const now = new Date().toISOString();
      await upsertStoredConnection({
        ...existing,
        status: "disconnected",
        tokens: null, // wipe token material entirely — nothing secret stays on file
        health: { status: "disconnected", message: "Disconnected by user.", checkedAt: now },
        lastActivity: now,
        history: pushHistory(existing.history, { type: "disconnected", at: now, message: "Disconnected by user." }),
      });
    },

    refreshToken,
    validateConnection,

    async health(connectionId: string): Promise<ConnectionHealth> {
      const existing = await getStoredConnection(connectionId);
      if (!existing) return { status: "disconnected", message: "Connection not found.", checkedAt: new Date().toISOString() };
      if (existing.status !== "connected" || !existing.tokens) return existing.health;

      if (shouldRefresh(existing.tokens.expiresAt)) {
        try {
          const refreshed = await refreshToken(connectionId);
          return refreshed.health;
        } catch {
          return (await getStoredConnection(connectionId) ?? existing).health;
        }
      }

      const valid = await validateConnection(connectionId);
      const checkedAt = new Date().toISOString();
      const health: ConnectionHealth = valid
        ? { status: "healthy", message: "Connected and validated.", checkedAt }
        : { status: "authentication-failed", message: "The provider rejected the current token.", checkedAt };
      await upsertStoredConnection({ ...existing, lastValidated: checkedAt, health });
      return health;
    },

    supportedScopes(): string[] {
      return config.defaultScopes;
    },
    supportedCapabilities(): ConnectionCapability[] {
      return config.capabilities;
    },
    metadata(): ProviderMetadata {
      return config.metadata;
    },
  };
}

export const googleProvider: ConnectionProvider = createProvider({
  id: "google",
  name: "Gmail",
  endpoints: {
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
    revocationEndpoint: "https://oauth2.googleapis.com/revoke",
  },
  clientIdEnvVar: "GOOGLE_OAUTH_CLIENT_ID",
  clientSecretEnvVar: "GOOGLE_OAUTH_CLIENT_SECRET",
  defaultScopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly"],
  capabilities: ["identity", "email-read"],
  metadata: { description: "Google account — connects Gmail for the future email ingestion milestone.", websiteUrl: "https://mail.google.com" },
  mapUserInfo: (json) => ({ id: String(json.sub ?? ""), email: String(json.email ?? ""), name: String(json.name ?? json.email ?? "Google Account") }),
});

export const microsoftProvider: ConnectionProvider = createProvider({
  id: "microsoft",
  name: "Outlook",
  endpoints: {
    authorizationEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfoEndpoint: "https://graph.microsoft.com/v1.0/me",
    // The v2.0 endpoint has no generic token-revocation API — disconnect()
    // falls back to discarding the locally-held token only.
  },
  clientIdEnvVar: "MICROSOFT_OAUTH_CLIENT_ID",
  clientSecretEnvVar: "MICROSOFT_OAUTH_CLIENT_SECRET",
  defaultScopes: ["openid", "email", "profile", "offline_access", "Mail.Read"],
  capabilities: ["identity", "email-read"],
  metadata: { description: "Microsoft account — connects Outlook for the future email ingestion milestone.", websiteUrl: "https://outlook.com" },
  mapUserInfo: (json) => ({
    id: String(json.id ?? ""),
    email: String(json.mail ?? json.userPrincipalName ?? ""),
    name: String(json.displayName ?? "Microsoft Account"),
  }),
});

export const yahooProvider: ConnectionProvider = createProvider({
  id: "yahoo",
  name: "Yahoo Mail",
  endpoints: {
    authorizationEndpoint: "https://api.login.yahoo.com/oauth2/request_auth",
    tokenEndpoint: "https://api.login.yahoo.com/oauth2/get_token",
    userInfoEndpoint: "https://api.login.yahoo.com/openid/v1/userinfo",
  },
  clientIdEnvVar: "YAHOO_OAUTH_CLIENT_ID",
  clientSecretEnvVar: "YAHOO_OAUTH_CLIENT_SECRET",
  defaultScopes: ["openid", "email", "profile"],
  capabilities: ["identity"],
  metadata: { description: "Yahoo account — identity only; Yahoo Mail API access requires separate partner approval.", websiteUrl: "https://mail.yahoo.com" },
  mapUserInfo: (json) => ({ id: String(json.sub ?? ""), email: String(json.email ?? ""), name: String(json.name ?? json.email ?? "Yahoo Account") }),
});

export const PROVIDERS: Record<ProviderId, ConnectionProvider> = {
  google: googleProvider,
  microsoft: microsoftProvider,
  yahoo: yahooProvider,
};

export function getProvider(id: ProviderId): ConnectionProvider {
  return PROVIDERS[id];
}
