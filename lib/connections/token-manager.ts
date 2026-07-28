/**
 * Token Manager — encrypts/decrypts OAuth token material at rest
 * (AES-256-GCM via Node's built-in `crypto`, no third-party dependency),
 * and owns every expiry/refresh-timing decision. Server-only: importing
 * `node:crypto` from a "use client" file is a Next.js build error, which
 * is exactly the safety net this module relies on in addition to never
 * being imported by one.
 *
 * The encryption key never lives in this codebase — it's read from
 * process.env.CONNECTION_HUB_ENCRYPTION_KEY (see .env.example), the same
 * "throw a clear error if unset, never hardcode a fallback" convention
 * lib/ai/provider.ts already uses for its own API keys.
 */
import crypto from "node:crypto";
import type { EncryptedPayload } from "@/lib/connections/types";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM

function getEncryptionKey(): Buffer {
  const raw = process.env.CONNECTION_HUB_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CONNECTION_HUB_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to .env.local.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CONNECTION_HUB_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded).");
  }
  return key;
}

export function encryptToken(plaintext: string): EncryptedPayload {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/** Throws if the ciphertext/authTag don't match (tampering, wrong key, or
 * corrupted data) — GCM authentication failure is the correct outcome for
 * any of those, never a silently-wrong plaintext. */
export function decryptToken(payload: EncryptedPayload): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Seconds of clock skew tolerated before treating a token as expired. */
const EXPIRY_SKEW_SECONDS = 60;
/** How far ahead of actual expiry a caller should proactively refresh —
 * "automatic refresh before expiration" from the spec. */
const REFRESH_THRESHOLD_SECONDS = 300;

export function isExpired(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() - EXPIRY_SKEW_SECONDS * 1000 <= now.getTime();
}

export function shouldRefresh(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() - REFRESH_THRESHOLD_SECONDS * 1000 <= now.getTime();
}
