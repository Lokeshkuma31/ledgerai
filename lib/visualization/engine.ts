import type { Transaction } from "@/types/transaction";
import type { ComparisonValue, DateWindow, TimeRangeValue } from "./types";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

/** Parses a "YYYY-MM-DD" (Transaction.date) as a local-midnight Date, never UTC. */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const EPOCH = new Date(1970, 0, 1);

/**
 * Resolves a TimeRangeValue to a concrete [start, end] window, hand-rolled
 * (this codebase has no date library) but centralized here so every chart
 * shares identical month-length/leap-year handling rather than each chart
 * re-deriving its own range math.
 */
export function resolveTimeRange(value: TimeRangeValue, now: Date = new Date()): DateWindow {
  switch (value.range) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "yesterday": {
      const yesterday = addDays(now, -1);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    }
    case "7d":
      return { start: startOfDay(addDays(now, -6)), end: endOfDay(now) };
    case "30d":
      return { start: startOfDay(addDays(now, -29)), end: endOfDay(now) };
    case "90d":
      return { start: startOfDay(addDays(now, -89)), end: endOfDay(now) };
    case "6m":
      return { start: addMonths(now, -5), end: endOfDay(now) };
    case "1y":
      return { start: addMonths(now, -11), end: endOfDay(now) };
    case "custom": {
      const start = value.start ? parseLocalDate(value.start) : EPOCH;
      const end = value.end ? endOfDay(parseLocalDate(value.end)) : endOfDay(now);
      return { start, end };
    }
    case "all":
    default:
      return { start: EPOCH, end: endOfDay(now) };
  }
}

/** The window immediately preceding `window`, of equal length — the basis for "Previous Period" comparisons. */
export function precedingWindow(window: DateWindow): DateWindow {
  const durationMs = window.end.getTime() - window.start.getTime();
  const end = new Date(window.start.getTime() - 1);
  const start = new Date(end.getTime() - durationMs);
  return { start, end };
}

/**
 * Resolves a ComparisonMode against the current window into the concrete
 * window to compare against. "previous-period" is an equal-length window
 * immediately before the current one; "previous-month"/"previous-year"
 * shift both endpoints back by a calendar month/year (clamped naturally by
 * `Date`'s own month-length rollover); "custom" uses the caller-supplied
 * bounds. Returns null when there's nothing to compare against.
 */
export function resolveComparisonWindow(
  current: DateWindow,
  comparison: ComparisonValue,
): DateWindow | null {
  switch (comparison.mode) {
    case "none":
      return null;
    case "previous-period":
      return precedingWindow(current);
    case "previous-month":
      return {
        start: new Date(current.start.getFullYear(), current.start.getMonth() - 1, current.start.getDate()),
        end: endOfDay(new Date(current.end.getFullYear(), current.end.getMonth() - 1, current.end.getDate())),
      };
    case "previous-year":
      return {
        start: new Date(current.start.getFullYear() - 1, current.start.getMonth(), current.start.getDate()),
        end: endOfDay(new Date(current.end.getFullYear() - 1, current.end.getMonth(), current.end.getDate())),
      };
    case "custom":
      if (!comparison.start || !comparison.end) return null;
      return { start: parseLocalDate(comparison.start), end: endOfDay(parseLocalDate(comparison.end)) };
    default:
      return null;
  }
}

export function filterTransactionsByRange(
  transactions: Transaction[],
  window: DateWindow,
): Transaction[] {
  return transactions.filter((t) => {
    const d = parseLocalDate(t.date);
    return d >= window.start && d <= window.end;
  });
}
