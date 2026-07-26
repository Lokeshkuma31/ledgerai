import type { Transaction } from "@/types/transaction";

export interface RecurringCandidate {
  /** Deterministic group key — merchantId when a merchant was identified,
   * otherwise a normalized-note key. Reused as the RecurringTransaction id. */
  groupKey: string;
  merchantId?: string;
  /** Most recent transaction's note — used as a display-title fallback for
   * merchant-less groups (e.g. "Rent", "Electricity"). */
  representativeNote: string;
  /** Sorted ascending by date. */
  transactions: Transaction[];
  amounts: number[];
  /** Days between consecutive occurrences, length = transactions.length - 1. */
  gaps: number[];
}

export interface MatcherOptions {
  minOccurrences?: number;
  amountTolerance?: number;
}

const MIN_OCCURRENCES = 3;
const AMOUNT_TOLERANCE = 0.2; // +/-20%

function normalizeNoteKey(note: string): string {
  return note.trim().replace(/\s+/g, " ").toLowerCase();
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / msPerDay,
  );
}

/**
 * Groups transactions by merchant — falling back to normalized note text
 * when no merchant was identified (e.g. "Rent", "Electricity Bill") — and
 * keeps only groups that plausibly represent a recurring pattern: at least
 * `minOccurrences` sightings with amounts within `amountTolerance` of their
 * average. Timing/frequency classification is predictor.ts's job, not this
 * module's — matching logic here stays isolated to "is this the same thing
 * happening repeatedly, for roughly the same amount."
 */
export function findRecurringCandidates(
  transactions: Transaction[],
  options: MatcherOptions = {},
): RecurringCandidate[] {
  const minOccurrences = options.minOccurrences ?? MIN_OCCURRENCES;
  const amountTolerance = options.amountTolerance ?? AMOUNT_TOLERANCE;

  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = t.merchantId ?? `note:${normalizeNoteKey(t.note)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(t);
    else groups.set(key, [t]);
  }

  const candidates: RecurringCandidate[] = [];
  for (const [key, group] of groups) {
    if (group.length < minOccurrences) continue;

    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map((t) => t.amount);
    const average = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const similarAmount = amounts.every(
      (a) => Math.abs(a - average) <= average * amountTolerance,
    );
    if (!similarAmount) continue;

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }

    candidates.push({
      groupKey: key,
      merchantId: sorted[0].merchantId,
      representativeNote: sorted[sorted.length - 1].note,
      transactions: sorted,
      amounts,
      gaps,
    });
  }

  return candidates;
}
