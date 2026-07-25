import type { Transaction } from "@/types/transaction";

export type TimelineGroupKey =
  | "today"
  | "yesterday"
  | "last7Days"
  | "thisMonth"
  | "older";

export interface TimelineGroup {
  key: TimelineGroupKey;
  label: string;
  transactions: Transaction[];
  totalAmount: number;
  transactionCount: number;
}

const GROUP_ORDER: { key: TimelineGroupKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7Days", label: "Last 7 Days" },
  { key: "thisMonth", label: "This Month" },
  { key: "older", label: "Older" },
];

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysSince(date: Date, today: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((today.getTime() - date.getTime()) / msPerDay);
}

/**
 * Buckets are mutually exclusive and checked in this order, so a date is
 * never double-counted (e.g. a "this month" date within the last 7 days
 * lands in "last7Days", not both).
 */
function classify(dateStr: string, today: Date): TimelineGroupKey {
  const date = parseLocalDate(dateStr);
  const diff = daysSince(date, today);

  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff <= 7) return "last7Days";
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth()
  ) {
    return "thisMonth";
  }
  return "older";
}

function sortNewestFirst(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * Reusable time-bucketed view over transactions. Pure data — no rendering,
 * no storage access. This is the foundation future features (weekly/monthly
 * reports, heatmaps, forecasting, budget analysis, calendar views) can
 * build on without re-deriving grouping logic.
 */
export function generateTimeline(
  transactions: Transaction[],
  now: Date = new Date(),
): TimelineGroup[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const buckets = new Map<TimelineGroupKey, Transaction[]>();
  for (const transaction of transactions) {
    const key = classify(transaction.date, today);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(transaction);
    } else {
      buckets.set(key, [transaction]);
    }
  }

  return GROUP_ORDER.filter(({ key }) => buckets.has(key)).map(
    ({ key, label }) => {
      const groupTransactions = sortNewestFirst(buckets.get(key)!);
      return {
        key,
        label,
        transactions: groupTransactions,
        totalAmount: groupTransactions.reduce((sum, t) => sum + t.amount, 0),
        transactionCount: groupTransactions.length,
      };
    },
  );
}
