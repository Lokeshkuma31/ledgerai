/**
 * Health Monitoring — pure derivation of ConnectionHealthStatus from a
 * connection's own state, plus the one function (checkConnectionHealth)
 * that asks the actual provider to validate the token live. Independent
 * of registry.ts's storage concerns — engine.ts is the only caller that
 * persists what this module computes.
 */
import { isExpired, shouldRefresh } from "@/lib/connections/token-manager";
import type { ConnectionHealth, ConnectionProvider, StoredConnection } from "@/lib/connections/types";

/**
 * Deterministic precedence, checked in order: an explicitly disconnected/
 * revoked/failed status always wins over anything token-timing-derived;
 * only a "connected" record's own token expiry is inspected further.
 */
export function deriveHealth(record: StoredConnection, now: Date = new Date()): ConnectionHealth {
  const checkedAt = now.toISOString();

  if (record.status === "disconnected") {
    return { status: "disconnected", message: "Not connected.", checkedAt };
  }
  if (record.status === "permission-revoked") {
    return { status: "permission-revoked", message: "Access was revoked — reconnect to restore this connection.", checkedAt };
  }
  if (record.status === "authentication-failed") {
    return { status: "authentication-failed", message: "The last authentication attempt failed.", checkedAt };
  }

  if (!record.tokens) {
    return { status: "disconnected", message: "No token on file.", checkedAt };
  }
  if (isExpired(record.tokens.expiresAt, now)) {
    return { status: "expired-token", message: "The access token has expired.", checkedAt };
  }
  if (shouldRefresh(record.tokens.expiresAt, now)) {
    return { status: "warning", message: "The access token is nearing expiry.", checkedAt };
  }
  return { status: "healthy", message: "Connected and validated.", checkedAt };
}

const REVOCATION_ERROR_CODES = new Set(["invalid_grant", "unauthorized_client"]);

/** Any refresh/validation failure this module recognizes as "the user (or
 * the provider) revoked access" rather than a transient network problem —
 * both Google and Microsoft return `invalid_grant` for a refresh token
 * that was revoked *or* has simply expired; there is no fully reliable way
 * to tell those apart from the error code alone, so this treats the more
 * actionable, more common real-world cause as the default. */
export function isRevocationError(errorCode: string): boolean {
  return REVOCATION_ERROR_CODES.has(errorCode);
}

/**
 * The "live" health check the spec's Health Monitoring calls for — asks
 * the provider to make one lightweight authenticated call
 * (validateConnection) rather than trusting only locally-derived expiry
 * timing, which can't detect an out-of-band revocation.
 */
export async function checkConnectionHealth(provider: ConnectionProvider, record: StoredConnection): Promise<ConnectionHealth> {
  return provider.health(record.id);
}
