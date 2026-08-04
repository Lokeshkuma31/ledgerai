/**
 * Connection Hub — shared types. Every other module in lib/connections/
 * depends only on this file (plus each other's own public functions) — it
 * never depends on them, the same single-source-of-truth role every other
 * framework's types.ts plays in this app.
 *
 * Two record shapes matter most: StoredConnection (server-only, carries
 * encrypted token material — never imported by a "use client" file or
 * returned from any function reachable by one) and ConnectionRecord (the
 * sanitized, token-free projection registry.ts's public read functions
 * return — the only shape the UI is ever allowed to see).
 */

export const PROVIDER_IDS = ["google", "microsoft", "yahoo"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_TYPES = ["oauth2"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const CONNECTION_CAPABILITIES = ["identity", "email-read"] as const;
export type ConnectionCapability = (typeof CONNECTION_CAPABILITIES)[number];

/** The exact seven states the spec names. "not-connected" is never
 * persisted — it's the UI's own fallback for a provider with no
 * ConnectionRecord at all yet. */
export const CONNECTION_STATUSES = [
  "not-connected",
  "connecting",
  "connected",
  "expired",
  "disconnected",
  "authentication-failed",
  "permission-revoked",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const CONNECTION_HEALTH_STATUSES = [
  "healthy",
  "warning",
  "expired-token",
  "permission-revoked",
  "authentication-failed",
  "disconnected",
] as const;
export type ConnectionHealthStatus = (typeof CONNECTION_HEALTH_STATUSES)[number];

export interface ConnectionHealth {
  status: ConnectionHealthStatus;
  message: string;
  checkedAt: string; // ISO 8601
}

export const CONNECTION_HISTORY_EVENT_TYPES = [
  "connected",
  "reconnected",
  "disconnected",
  "token-refreshed",
  "validation-failed",
  "permission-revoked",
  "renamed",
] as const;
export type ConnectionHistoryEventType = (typeof CONNECTION_HISTORY_EVENT_TYPES)[number];

export interface ConnectionHistoryEvent {
  type: ConnectionHistoryEventType;
  at: string; // ISO 8601
  message: string;
}

/** AES-256-GCM output — ciphertext, iv, and auth tag, each base64. Never
 * contains plaintext; never itself contains the encryption key. */
export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/** Server-only token material. Only token-manager.ts encrypts/decrypts
 * this; only registry.ts persists it. Nothing outside lib/connections/
 * (and the two Route Handlers) may import a type or function that could
 * hand this back. */
export interface TokenSet {
  accessToken: EncryptedPayload;
  refreshToken: EncryptedPayload | null;
  expiresAt: string; // ISO 8601
  tokenType: string;
  scopes: string[];
}

/**
 * The full persisted record — server-only. Registry.ts's internal
 * read/write functions return this; its public functions
 * (getAllConnectionRecords/getConnectionRecord) never do.
 */
export interface StoredConnection {
  id: string;
  /** Owning Better Auth user — added when the registry moved off the
   * single-implicit-user file store to a real, multi-user Postgres table
   * (see repositories/connection-repository.ts). Every other function in
   * this module that operates on a single already-known connection id
   * still takes only that id, since id is globally unique; only
   * account-lookup/listing functions need this to scope their query. */
  userId: string;
  provider: ProviderId;
  providerAccountId: string;
  displayName: string;
  email: string;
  status: ConnectionStatus;
  connectedAt: string; // ISO 8601
  lastValidated: string | null; // ISO 8601
  lastActivity: string; // ISO 8601
  tokens: TokenSet | null; // null after disconnect — tokens are wiped, not just flagged
  health: ConnectionHealth;
  history: ConnectionHistoryEvent[];
  metadata: Record<string, unknown>;
}

/**
 * The UI-safe projection of a StoredConnection — no token field exists on
 * this type at all, so there is no accidental path for a token to reach a
 * Client Component. This is the only shape any component, Server Action
 * response, or Coach/Feed/Index contribution ever sees.
 */
export interface ConnectionRecord {
  id: string;
  provider: ProviderId;
  providerAccountId: string;
  displayName: string;
  email: string;
  status: ConnectionStatus;
  connectedAt: string;
  lastValidated: string | null;
  lastActivity: string;
  scopes: string[];
  /** ISO 8601, or null once disconnected — exposing *when* a token expires
   * is safe and operationally useful; the token value itself never is. */
  tokenExpiresAt: string | null;
  health: ConnectionHealth;
  history: ConnectionHistoryEvent[];
  metadata: Record<string, unknown>;
}

export interface ProviderMetadata {
  description: string;
  websiteUrl?: string;
}

/** A provider's own static description — id/name/version/type plus the
 * scopes and capabilities it can grant, independent of whether any
 * account has connected it yet. Backs each not-yet-connected ProviderCard. */
export interface ProviderDescriptor {
  id: ProviderId;
  name: string;
  version: string;
  type: ProviderType;
  metadata: ProviderMetadata;
  supportedScopes: string[];
  supportedCapabilities: ConnectionCapability[];
}

/** What connect() needs after a Route Handler receives the provider's
 * callback redirect. */
export interface OAuthConnectInput {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  /** The signed-in Better Auth user completing this connection — resolved
   * from the session by the Route Handler, which is the one place that
   * has request context. */
  userId: string;
  /** Set when this call is completing a Reconnect rather than a fresh
   * Connect — engine.ts updates this existing record in place instead of
   * creating a duplicate. */
  existingConnectionId?: string;
}

/**
 * The Provider Interface the spec names, implemented once per provider in
 * providers.ts. `buildAuthorizationUrl` isn't in the spec's literal method
 * list but is unavoidable for a real Authorization Code flow — the
 * Route Handler that starts a connection needs it to build the redirect,
 * symmetric with connect() completing it.
 */
export interface ConnectionProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly version: string;
  readonly type: ProviderType;

  buildAuthorizationUrl(params: { state: string; codeChallenge: string; redirectUri: string }): string;
  connect(input: OAuthConnectInput): Promise<StoredConnection>;
  disconnect(connectionId: string): Promise<void>;
  refreshToken(connectionId: string): Promise<StoredConnection>;
  validateConnection(connectionId: string): Promise<boolean>;
  health(connectionId: string): Promise<ConnectionHealth>;

  supportedScopes(): string[];
  supportedCapabilities(): ConnectionCapability[];
  metadata(): ProviderMetadata;
}

export interface OAuthErrorInfo {
  code: string;
  message: string;
}
