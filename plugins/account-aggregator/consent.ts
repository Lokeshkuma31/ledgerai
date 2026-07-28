/**
 * Consent Management — an independent, testable module owning exactly the
 * Consent state machine (Pending -> Granted/Denied, Granted -> Expired/
 * Revoked). No React, no provider/connector imports: auth.ts is the only
 * caller, and it hands this module plain data rather than the other way
 * around, so there's no shared state between the provider and connector
 * layers.
 */
import { PROVIDER_NAME } from "@/plugins/account-aggregator/mock-provider";
import type { Consent, ConsentPermission, ConsentStatus, ConsentTimelineEntry } from "@/plugins/account-aggregator/types";

const CONSENT_KEY = "ledgerai:plugins:account-aggregator:consent";
const HISTORY_KEY = "ledgerai:plugins:account-aggregator:consent-history";
const CONSENT_VALIDITY_DAYS = 90;

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function appendHistory(entry: ConsentTimelineEntry): void {
  const history = readJSON<ConsentTimelineEntry[]>(HISTORY_KEY, []);
  writeJSON(HISTORY_KEY, [...history, entry].slice(-100));
}

export function getConsent(): Consent | null {
  return readJSON<Consent | null>(CONSENT_KEY, null);
}

export function getConsentHistory(): ConsentTimelineEntry[] {
  return readJSON<ConsentTimelineEntry[]>(HISTORY_KEY, []);
}

function transition(status: ConsentStatus, patch: Partial<Consent>, note: string): Consent {
  const existing = getConsent();
  const now = new Date().toISOString();
  const next: Consent = {
    id: existing?.id ?? crypto.randomUUID(),
    provider: PROVIDER_NAME,
    purpose: existing?.purpose ?? "Personal finance aggregation",
    createdAt: existing?.createdAt ?? now,
    linkedAccounts: existing?.linkedAccounts ?? [],
    permissions: existing?.permissions ?? [],
    expiresAt: existing?.expiresAt ?? null,
    ...patch,
    status,
    lastUpdated: now,
  };
  writeJSON(CONSENT_KEY, next);
  appendHistory({ status, at: now, note });
  return next;
}

export function requestConsent(purpose: string, permissions: ConsentPermission[]): Consent {
  return transition(
    "Pending",
    { purpose, permissions, linkedAccounts: [] },
    `Consent requested for: ${permissions.join(", ")}.`,
  );
}

export function grantConsent(linkedAccounts: string[]): Consent {
  const expiresAt = new Date(Date.now() + CONSENT_VALIDITY_DAYS * 86_400_000).toISOString();
  return transition("Granted", { linkedAccounts, expiresAt }, `Consent granted for ${linkedAccounts.length} account(s).`);
}

export function denyConsent(reason = "User declined the consent request."): Consent {
  return transition("Denied", {}, reason);
}

export function revokeConsent(): Consent | null {
  if (!getConsent()) return null;
  return transition("Revoked", { linkedAccounts: [] }, "Consent revoked by user (disconnect).");
}

/** Checks a Granted consent's expiry against `now`, transitioning it to
 * Expired if past its expiresAt — called before every sync/health check so
 * an expired consent is caught deterministically rather than silently
 * treated as still valid. Returns the (possibly updated) consent. */
export function expireIfNeeded(now: Date = new Date()): Consent | null {
  const consent = getConsent();
  if (!consent || consent.status !== "Granted" || !consent.expiresAt) return consent;
  if (new Date(consent.expiresAt).getTime() > now.getTime()) return consent;
  return transition("Expired", {}, "Consent expired.");
}
