import type { CoachOutput } from "@/lib/coach/coach";
import type { Transaction } from "@/types/transaction";

const CACHE_KEY = "ledgerai:coach-cache";

interface CoachCache {
  signature: string;
  response: CoachOutput;
}

/**
 * Changes whenever a transaction is added, reviewed, or its category
 * changes — the only conditions under which the coach should regenerate.
 */
export function computeCoachSignature(
  transactions: Transaction[],
  memoryEntryCount: number,
): string {
  const parts = transactions.map(
    (t) =>
      `${t.id}:${t.reviewed ? 1 : 0}:${t.userCategory ?? t.aiCategory ?? ""}`,
  );
  return `${parts.join("|")}::mem${memoryEntryCount}`;
}

export function loadCoachCache(): CoachCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.signature !== "string"
    ) {
      return null;
    }
    return parsed as CoachCache;
  } catch {
    return null;
  }
}

export function saveCoachCache(signature: string, response: CoachOutput): void {
  if (typeof window === "undefined") return;
  const cache: CoachCache = { signature, response };
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}
