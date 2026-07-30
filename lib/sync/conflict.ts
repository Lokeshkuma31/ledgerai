/**
 * Conflict Resolution — pure classification helpers, no persistence, no
 * React. Deliberately does NOT implement its own duplicate-detection
 * heuristic: the spec asks the Sync Engine to "delegate duplicate
 * detection to existing services", so every function here takes a
 * caller-supplied ConflictDetector<T> (a provider's own matching/fingerprint
 * logic — e.g. lib/banks/mapper.ts's computeTransactionFingerprint) and
 * only shapes the result into the engine's ConflictRecord/SyncJob fields.
 */
import type { ConflictRecord } from "@/lib/sync/types";

export interface ConflictDetector<T> {
  /** Returns the matching already-known item, if any — decided entirely by
   * the provider's own dedup service. */
  findExisting(incoming: T, existing: T[]): T | undefined;
  /** True when `incoming` and its match are identical in every way that
   * matters (a pure duplicate); false means the provider's data changed
   * since the last sync (an update, not a duplicate). */
  isIdentical(incoming: T, existingMatch: T): boolean;
  /** Human-readable id for the conflict record, e.g. an external
   * transaction id. */
  identify(item: T): string;
}

export interface ConflictResolutionOutcome<T> {
  /** Genuinely new items — never seen before. */
  toImport: T[];
  conflicts: ConflictRecord[];
}

/**
 * Splits `incoming` into new items vs. conflicts against `existing`,
 * using `detector` for every matching/sameness decision. Every duplicate
 * or update is recorded as a ConflictRecord so the caller can fold its
 * count into the job's duplicates/warnings and Sync History.
 */
export function resolveConflicts<T>(
  incoming: T[],
  existing: T[],
  detector: ConflictDetector<T>,
  now: Date = new Date(),
): ConflictResolutionOutcome<T> {
  const toImport: T[] = [];
  const conflicts: ConflictRecord[] = [];
  const detectedAt = now.toISOString();

  for (const item of incoming) {
    const match = detector.findExisting(item, existing);
    if (!match) {
      toImport.push(item);
      continue;
    }

    if (detector.isIdentical(item, match)) {
      conflicts.push({
        type: "duplicate-transaction",
        itemId: detector.identify(item),
        detail: "Matches an already-imported item exactly — skipped.",
        resolvedAs: "kept-existing",
        detectedAt,
      });
    } else {
      conflicts.push({
        type: "updated-transaction",
        itemId: detector.identify(item),
        detail: "Matches an already-imported item, but its data changed since the last sync — the provider's latest data is treated as authoritative.",
        resolvedAs: "kept-incoming",
        detectedAt,
      });
    }
  }

  return { toImport, conflicts };
}

/** A provider reported that a previously-synced item no longer exists
 * upstream (e.g. a reversed transaction) — there's no "incoming" item to
 * compare against a match, only an absence, so this is recorded directly
 * rather than through resolveConflicts. */
export function recordDeletedItem(itemId: string, detail: string, now: Date = new Date()): ConflictRecord {
  return { type: "deleted-item", itemId, detail, resolvedAs: "skipped", detectedAt: now.toISOString() };
}

/** The provider's own schema/version for an item changed in a way that
 * isn't a simple field update (e.g. a new API version restructured the
 * record) — the provider's latest shape wins. */
export function recordProviderVersionChange(itemId: string, detail: string, now: Date = new Date()): ConflictRecord {
  return { type: "provider-version-change", itemId, detail, resolvedAs: "kept-incoming", detectedAt: now.toISOString() };
}

/** Two records claim the same real-world event at conflicting timestamps
 * (e.g. a pending-vs-posted date mismatch) — kept as a distinct conflict
 * type from "updated-transaction" since resolving it may need different
 * judgment than a simple field change. */
export function recordTimestampConflict(itemId: string, detail: string, now: Date = new Date()): ConflictRecord {
  return { type: "timestamp-conflict", itemId, detail, resolvedAs: "kept-existing", detectedAt: now.toISOString() };
}
