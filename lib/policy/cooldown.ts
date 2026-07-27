import type { FeedItemType } from "@/types/feed";

const STORAGE_KEY = "ledgerai:policy:cooldowns";

interface CooldownState {
  cooldownKey: string;
  /** ISO 8601 — the last time this cooldownKey was allowed to fire. */
  lastFiredAt: string;
  /** Cheap content fingerprint (not a cryptographic hash) used to detect
   * "nothing meaningfully changed since last time". */
  lastContentSignature: string;
}

type CooldownStateMap = Record<string, CooldownState>;

/** Default suppression windows, keyed by the feed item type that produced
 * the candidate. Deliberately conservative for the highest-urgency types
 * per the spec's "Budget exceeded -> suppress duplicates for 24 hours". */
export const DEFAULT_COOLDOWN_WINDOWS_MS: Partial<Record<FeedItemType, number>> = {
  "budget-warning": 24 * 60 * 60 * 1000,
  "budget-recovered": 24 * 60 * 60 * 1000,
  "forecast-update": 24 * 60 * 60 * 1000,
  "cash-flow-change": 24 * 60 * 60 * 1000,
  "large-expense": 6 * 60 * 60 * 1000,
  "unusual-spending": 12 * 60 * 60 * 1000,
  "subscription-renewal": 24 * 60 * 60 * 1000,
  "salary-expected": 24 * 60 * 60 * 1000,
};
const DEFAULT_COOLDOWN_WINDOW_MS = 12 * 60 * 60 * 1000;

export function cooldownWindowFor(feedType: FeedItemType): number {
  return DEFAULT_COOLDOWN_WINDOWS_MS[feedType] ?? DEFAULT_COOLDOWN_WINDOW_MS;
}

function readAll(): CooldownStateMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as CooldownStateMap) : {};
  } catch {
    return {};
  }
}

function writeAll(state: CooldownStateMap): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getCooldownState(cooldownKey: string): CooldownState | undefined {
  return readAll()[cooldownKey];
}

/**
 * True when a fresh "Notify Immediately" / "Schedule Later" firing should
 * be suppressed for this cooldownKey — either the window since it last
 * fired hasn't elapsed yet ("Budget exceeded -> suppress duplicates for 24
 * hours"), or nothing about the situation has changed since then
 * ("Forecast unchanged -> no additional notifications").
 */
export function isSuppressedByCooldown(
  cooldownKey: string,
  contentSignature: string,
  windowMs: number,
  now: Date,
): boolean {
  const state = getCooldownState(cooldownKey);
  if (!state) return false;
  const withinWindow = now.getTime() - new Date(state.lastFiredAt).getTime() < windowMs;
  const contentUnchanged = state.lastContentSignature === contentSignature;
  return withinWindow || contentUnchanged;
}

/** Records that this cooldownKey fired just now, with its current content
 * signature, so the next evaluation can detect "unchanged" or "too soon". */
export function recordFiring(cooldownKey: string, contentSignature: string, now: Date): void {
  const all = readAll();
  all[cooldownKey] = { cooldownKey, lastFiredAt: now.toISOString(), lastContentSignature: contentSignature };
  writeAll(all);
}

export function clearCooldowns(): void {
  writeAll({});
}
