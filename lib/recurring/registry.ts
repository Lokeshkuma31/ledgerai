import type { RecurringStatus, RecurringTransaction } from "@/types/recurring";

const RECURRING_STORAGE_KEY = "ledgerai:recurring";
const OVERRIDE_STORAGE_KEY = "ledgerai:recurring:overrides";

type ManualOverride = Extract<RecurringStatus, "Paused" | "Stopped">;

const AMOUNT_CHANGE_TOLERANCE = 0.15;

function readRecurring(): RecurringTransaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECURRING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecurringTransaction[]) : [];
  } catch {
    return [];
  }
}

function writeRecurring(items: RecurringTransaction[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(items));
}

function readOverrides(): Record<string, ManualOverride> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OVERRIDE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeOverrides(overrides: Record<string, ManualOverride>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(overrides));
}

/** Read-only — the current, already-reconciled recurring items. UI pages
 * use this; only reconcileRecurring (below) writes. */
export function getAllRecurring(): RecurringTransaction[] {
  return readRecurring();
}

export function findRecurring(id: string): RecurringTransaction | undefined {
  return readRecurring().find((r) => r.id === id);
}

export function pauseRecurring(id: string): void {
  const overrides = readOverrides();
  overrides[id] = "Paused";
  writeOverrides(overrides);
  writeRecurring(
    readRecurring().map((r) => (r.id === id ? { ...r, status: "Paused" } : r)),
  );
}

export function resumeRecurring(id: string): void {
  const overrides = readOverrides();
  delete overrides[id];
  writeOverrides(overrides);
}

export interface RecurringReconciliation {
  items: RecurringTransaction[];
  newlyDetected: RecurringTransaction[];
  amountChanges: { item: RecurringTransaction; previousAmount: number }[];
}

/**
 * Persists a freshly-detected snapshot (from lib/recurring/engine.ts),
 * diffing against what was previously known to report genuinely new items
 * and meaningful amount changes — the signal the Financial Events Engine
 * needs for "New Subscription Detected" / "Recurring Amount Changed". A
 * manual Pause overrides the freshly-computed status until resumed.
 */
export function reconcileRecurring(
  freshItems: RecurringTransaction[],
): RecurringReconciliation {
  const previousById = new Map(readRecurring().map((r) => [r.id, r]));
  const overrides = readOverrides();

  const newlyDetected: RecurringTransaction[] = [];
  const amountChanges: { item: RecurringTransaction; previousAmount: number }[] = [];

  const items = freshItems.map((fresh) => {
    const existing = previousById.get(fresh.id);
    const status = overrides[fresh.id] ?? fresh.status;

    if (!existing) {
      const created = { ...fresh, status };
      newlyDetected.push(created);
      return created;
    }

    if (
      fresh.lastOccurrence > existing.lastOccurrence &&
      Math.abs(fresh.lastAmount - existing.lastAmount) >
        existing.averageAmount * AMOUNT_CHANGE_TOLERANCE
    ) {
      amountChanges.push({ item: fresh, previousAmount: existing.lastAmount });
    }

    return { ...fresh, status, createdAt: existing.createdAt };
  });

  writeRecurring(items);

  const survivingIds = new Set(items.map((i) => i.id));
  const prunedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([id]) => survivingIds.has(id)),
  );
  writeOverrides(prunedOverrides);

  return { items, newlyDetected, amountChanges };
}
