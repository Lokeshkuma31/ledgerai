import type { Transaction } from "@/types/transaction";

const CACHE_KEY_PREFIX = "ledgerai:analytics-cache:";

interface AnalyticsCache<T> {
  signature: string;
  value: T;
}

/**
 * Mirrors lib/coach/cache.ts's signature-diff shape: a cheap string built
 * from stable identity fields, not a hash of the full payload. Since
 * DashboardProvider.refresh() reruns the whole orchestrator from scratch on
 * every call, chart aggregations must not recompute unless the inputs that
 * actually matter to them changed.
 */
export function computeAnalyticsSignature(
  transactions: Transaction[],
  extra: string[] = [],
): string {
  const txParts = transactions.map((t) => `${t.id}:${t.date}:${t.amount}:${t.userCategory ?? t.aiCategory ?? ""}`);
  return `${txParts.join("|")}::${extra.join("|")}`;
}

export function loadAnalyticsCache<T>(key: string): AnalyticsCache<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || typeof parsed.signature !== "string") {
      return null;
    }
    return parsed as AnalyticsCache<T>;
  } catch {
    return null;
  }
}

export function saveAnalyticsCache<T>(key: string, signature: string, value: T): void {
  if (typeof window === "undefined") return;
  const cache: AnalyticsCache<T> = { signature, value };
  window.localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(cache));
}
