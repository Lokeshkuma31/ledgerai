import type { RecurringFrequency, RecurringStatus } from "@/types/recurring";

interface FrequencyBucket {
  frequency: Exclude<RecurringFrequency, "Unknown">;
  minDays: number;
  maxDays: number;
  typicalDays: number;
}

const FREQUENCY_BUCKETS: FrequencyBucket[] = [
  { frequency: "Daily", minDays: 1, maxDays: 2, typicalDays: 1 },
  { frequency: "Weekly", minDays: 5, maxDays: 9, typicalDays: 7 },
  { frequency: "Biweekly", minDays: 12, maxDays: 18, typicalDays: 14 },
  { frequency: "Monthly", minDays: 25, maxDays: 35, typicalDays: 30 },
  { frequency: "Quarterly", minDays: 80, maxDays: 100, typicalDays: 91 },
  { frequency: "Yearly", minDays: 350, maxDays: 380, typicalDays: 365 },
];

const GAP_CONSISTENCY_TOLERANCE = 0.3; // +/-30% of the median gap
const UPCOMING_WINDOW_DAYS = 7;
const MISSED_GRACE_DAYS = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Classifies day-gaps between consecutive occurrences into a supported
 * frequency. Requires the gaps to be reasonably consistent (within
 * GAP_CONSISTENCY_TOLERANCE of the median) — a merchant that's technically
 * recurring but wildly irregularly timed gets "Unknown" rather than a
 * misleading label, per the spec's own list of supported frequencies.
 */
export function inferFrequency(gaps: number[]): RecurringFrequency {
  if (gaps.length === 0) return "Unknown";
  const medianGap = median(gaps);
  if (medianGap <= 0) return "Unknown";

  const isConsistent = gaps.every(
    (g) => Math.abs(g - medianGap) <= medianGap * GAP_CONSISTENCY_TOLERANCE,
  );
  if (!isConsistent) return "Unknown";

  const bucket = FREQUENCY_BUCKETS.find(
    (b) => medianGap >= b.minDays && medianGap <= b.maxDays,
  );
  return bucket?.frequency ?? "Unknown";
}

function typicalIntervalDays(frequency: RecurringFrequency): number | null {
  return FREQUENCY_BUCKETS.find((b) => b.frequency === frequency)?.typicalDays ?? null;
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Returns null for "Unknown" frequency — timing too irregular to predict. */
export function predictNextOccurrence(
  lastOccurrence: string,
  frequency: RecurringFrequency,
): string | null {
  const interval = typicalIntervalDays(frequency);
  if (interval === null) return null;
  const last = parseLocalDate(lastOccurrence);
  const next = new Date(last.getFullYear(), last.getMonth(), last.getDate() + interval);
  return formatDate(next);
}

export function computeDaysRemaining(
  nextExpected: string | null,
  now: Date,
): number | null {
  if (!nextExpected) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = parseLocalDate(nextExpected);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((next.getTime() - today.getTime()) / msPerDay);
}

/**
 * Automatic status from timing alone — "Paused" is never inferred here
 * (it's a manual user action the registry layers on top). "Active" is the
 * default steady state: not due soon, not overdue.
 * - Upcoming: due within UPCOMING_WINDOW_DAYS.
 * - Missed: overdue past a small grace window, but within one full cycle.
 * - Stopped: overdue by more than a full cycle — the pattern has broken.
 */
export function determineStatus(
  daysRemaining: number | null,
  frequency: RecurringFrequency,
): RecurringStatus {
  if (daysRemaining === null) return "Active";
  if (daysRemaining > UPCOMING_WINDOW_DAYS) return "Active";
  if (daysRemaining >= 0) return "Upcoming";

  const overdueDays = -daysRemaining;
  if (overdueDays <= MISSED_GRACE_DAYS) return "Active";

  const interval = typicalIntervalDays(frequency) ?? Infinity;
  return overdueDays <= interval ? "Missed" : "Stopped";
}
