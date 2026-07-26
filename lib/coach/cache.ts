import type { CoachOutput } from "@/lib/coach/coach";
import type { Transaction } from "@/types/transaction";

const CACHE_KEY = "ledgerai:coach-cache";

interface CoachCache {
  signature: string;
  response: CoachOutput;
}

/**
 * Changes whenever a transaction is added, reviewed, its category changes,
 * a budget is created/updated/deleted, the set of active recommendations
 * changes (dismissed/completed), a merchant is merged/deleted (which
 * changes what the Coach sees in `merchantSummaries` without necessarily
 * touching any transaction), or a recurring item's status changes (e.g.
 * Upcoming -> Missed purely because time passed, with no new transaction)
 * — the only conditions under which the coach should regenerate.
 */
export function computeCoachSignature(
  transactions: Transaction[],
  memoryEntryCount: number,
  budgets: { id: string; monthlyLimit: number }[] = [],
  recommendationIds: string[] = [],
  merchantIds: string[] = [],
  recurringStatuses: string[] = [],
): string {
  const txParts = transactions.map(
    (t) =>
      `${t.id}:${t.reviewed ? 1 : 0}:${t.userCategory ?? t.aiCategory ?? ""}`,
  );
  const budgetParts = budgets.map((b) => `${b.id}:${b.monthlyLimit}`);
  return `${txParts.join("|")}::mem${memoryEntryCount}::budgets${budgetParts.join("|")}::recs${recommendationIds.join("|")}::merchants${merchantIds.join("|")}::recurring${recurringStatuses.join("|")}`;
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
