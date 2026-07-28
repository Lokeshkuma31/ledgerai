import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, isExpired, shouldRefresh } from "@/lib/connections/token-manager";

process.env.CONNECTION_HUB_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

describe("token encryption", () => {
  it("round-trips a plaintext token and never leaks it into the ciphertext", () => {
    const payload = encryptToken("super-secret-access-token");
    expect(payload.ciphertext).not.toContain("super-secret-access-token");
    expect(decryptToken(payload)).toBe("super-secret-access-token");
  });

  it("produces a different ciphertext each time (random IV) even for the same plaintext", () => {
    const a = encryptToken("same-value");
    const b = encryptToken("same-value");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("fails GCM authentication on a tampered ciphertext rather than returning wrong plaintext", () => {
    const payload = encryptToken("token-value");
    const tampered = { ...payload, ciphertext: Buffer.from("not the right bytes at all!!").toString("base64") };
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("throws a clear error when the encryption key is not configured", () => {
    const original = process.env.CONNECTION_HUB_ENCRYPTION_KEY;
    delete process.env.CONNECTION_HUB_ENCRYPTION_KEY;
    try {
      expect(() => encryptToken("x")).toThrow(/CONNECTION_HUB_ENCRYPTION_KEY/);
    } finally {
      process.env.CONNECTION_HUB_ENCRYPTION_KEY = original;
    }
  });
});

describe("expiry timing", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("isExpired accounts for clock skew (60s)", () => {
    expect(isExpired("2026-01-01T00:00:30.000Z", now)).toBe(true);
    expect(isExpired("2026-01-01T00:05:00.000Z", now)).toBe(false);
    expect(isExpired("2025-12-31T23:59:00.000Z", now)).toBe(true);
  });

  it("shouldRefresh fires within the proactive-refresh threshold (5 minutes)", () => {
    expect(shouldRefresh("2026-01-01T00:04:00.000Z", now)).toBe(true);
    expect(shouldRefresh("2026-01-01T00:10:00.000Z", now)).toBe(false);
  });
});
