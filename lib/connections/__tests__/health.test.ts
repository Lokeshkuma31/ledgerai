import { describe, expect, it } from "vitest";
import { deriveHealth, isRevocationError } from "@/lib/connections/health";
import type { StoredConnection } from "@/lib/connections/types";

function baseRecord(overrides: Partial<StoredConnection> = {}): StoredConnection {
  return {
    id: "c1",
    provider: "google",
    providerAccountId: "u1",
    displayName: "Gmail",
    email: "person@gmail.com",
    status: "connected",
    connectedAt: "2026-01-01T00:00:00.000Z",
    lastValidated: null,
    lastActivity: "2026-01-01T00:00:00.000Z",
    tokens: {
      accessToken: { ciphertext: "x", iv: "y", authTag: "z" },
      refreshToken: null,
      expiresAt: "2026-01-01T01:00:00.000Z",
      tokenType: "Bearer",
      scopes: ["openid"],
    },
    health: { status: "healthy", message: "", checkedAt: "2026-01-01T00:00:00.000Z" },
    history: [],
    metadata: {},
    ...overrides,
  };
}

describe("deriveHealth", () => {
  it("reports healthy when the token has plenty of time left", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(deriveHealth(baseRecord(), now).status).toBe("healthy");
  });

  it("reports warning when nearing expiry (within the refresh threshold)", () => {
    const now = new Date("2026-01-01T00:58:00.000Z");
    expect(deriveHealth(baseRecord(), now).status).toBe("warning");
  });

  it("reports expired-token once expiry has passed (Expired Token Handling)", () => {
    const now = new Date("2026-01-01T02:00:00.000Z");
    expect(deriveHealth(baseRecord(), now).status).toBe("expired-token");
  });

  it("an explicit disconnected/revoked/failed status always wins over token timing", () => {
    const now = new Date("2026-01-01T00:00:00.000Z"); // token itself still fresh
    expect(deriveHealth(baseRecord({ status: "disconnected", tokens: null }), now).status).toBe("disconnected");
    expect(deriveHealth(baseRecord({ status: "permission-revoked" }), now).status).toBe("permission-revoked");
    expect(deriveHealth(baseRecord({ status: "authentication-failed" }), now).status).toBe("authentication-failed");
  });

  it("reports disconnected when a connected record somehow has no token on file", () => {
    expect(deriveHealth(baseRecord({ tokens: null })).status).toBe("disconnected");
  });
});

describe("isRevocationError", () => {
  it("treats invalid_grant and unauthorized_client as revocation (Revoked Permission Detection)", () => {
    expect(isRevocationError("invalid_grant")).toBe(true);
    expect(isRevocationError("unauthorized_client")).toBe(true);
  });

  it("treats other error codes as a transient/authentication failure, not revocation", () => {
    expect(isRevocationError("request_failed")).toBe(false);
    expect(isRevocationError("server_error")).toBe(false);
  });
});
