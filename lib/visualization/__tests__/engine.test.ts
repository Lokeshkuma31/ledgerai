import { describe, expect, it } from "vitest";
import {
  filterTransactionsByRange,
  parseLocalDate,
  precedingWindow,
  resolveComparisonWindow,
  resolveTimeRange,
} from "@/lib/visualization/engine";
import type { Transaction } from "@/types/transaction";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    amount: 100,
    note: "",
    paymentMethod: "UPI",
    reviewed: false,
    date: "2026-07-15",
    createdAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveTimeRange", () => {
  const now = new Date(2026, 6, 20); // Jul 20, 2026

  it("resolves 'today' to the current calendar day", () => {
    const { start, end } = resolveTimeRange({ range: "today" }, now);
    expect(start).toEqual(new Date(2026, 6, 20));
    expect(end).toEqual(new Date(2026, 6, 20, 23, 59, 59, 999));
  });

  it("resolves 'yesterday' to the previous calendar day", () => {
    const { start } = resolveTimeRange({ range: "yesterday" }, now);
    expect(start).toEqual(new Date(2026, 6, 19));
  });

  it("resolves '7d' to a 7-day inclusive window ending today", () => {
    const { start, end } = resolveTimeRange({ range: "7d" }, now);
    expect(start).toEqual(new Date(2026, 6, 14));
    expect(end.getDate()).toBe(20);
  });

  it("resolves '6m' across a year boundary", () => {
    const janNow = new Date(2026, 1, 10); // Feb 10, 2026
    const { start } = resolveTimeRange({ range: "6m" }, janNow);
    expect(start).toEqual(new Date(2025, 8, 1)); // Sep 2025
  });

  it("handles leap-year Feb 29 in a custom range", () => {
    const { start, end } = resolveTimeRange(
      { range: "custom", start: "2024-02-29", end: "2024-02-29" },
      now,
    );
    expect(start).toEqual(new Date(2024, 1, 29));
    expect(end).toEqual(new Date(2024, 1, 29, 23, 59, 59, 999));
  });

  it("falls back to epoch-to-now for 'all'", () => {
    const { start, end } = resolveTimeRange({ range: "all" }, now);
    expect(start).toEqual(new Date(1970, 0, 1));
    expect(end.getDate()).toBe(20);
  });
});

describe("precedingWindow", () => {
  it("returns an equal-length window immediately before the given one", () => {
    const window = { start: new Date(2026, 6, 14), end: new Date(2026, 6, 20, 23, 59, 59, 999) };
    const preceding = precedingWindow(window);
    const durationMs = window.end.getTime() - window.start.getTime();
    expect(preceding.end.getTime()).toBe(window.start.getTime() - 1);
    expect(preceding.end.getTime() - preceding.start.getTime()).toBe(durationMs);
  });
});

describe("resolveComparisonWindow", () => {
  const current = { start: new Date(2026, 6, 14), end: new Date(2026, 6, 20, 23, 59, 59, 999) };

  it("returns null for 'none'", () => {
    expect(resolveComparisonWindow(current, { mode: "none" })).toBeNull();
  });

  it("returns an equal-length preceding window for 'previous-period'", () => {
    const result = resolveComparisonWindow(current, { mode: "previous-period" });
    expect(result).toEqual(precedingWindow(current));
  });

  it("shifts back one calendar month for 'previous-month'", () => {
    const result = resolveComparisonWindow(current, { mode: "previous-month" })!;
    expect(result.start).toEqual(new Date(2026, 5, 14));
    expect(result.end.getMonth()).toBe(5);
  });

  it("shifts back one calendar year for 'previous-year'", () => {
    const result = resolveComparisonWindow(current, { mode: "previous-year" })!;
    expect(result.start).toEqual(new Date(2025, 6, 14));
  });

  it("uses the caller-supplied bounds for 'custom'", () => {
    const result = resolveComparisonWindow(current, {
      mode: "custom",
      start: "2026-01-01",
      end: "2026-01-31",
    })!;
    expect(result.start).toEqual(new Date(2026, 0, 1));
    expect(result.end).toEqual(new Date(2026, 0, 31, 23, 59, 59, 999));
  });

  it("returns null for 'custom' with missing bounds", () => {
    expect(resolveComparisonWindow(current, { mode: "custom" })).toBeNull();
  });
});

describe("parseLocalDate", () => {
  it("parses YYYY-MM-DD as a local-midnight date, not UTC", () => {
    expect(parseLocalDate("2026-07-15")).toEqual(new Date(2026, 6, 15));
  });
});

describe("filterTransactionsByRange", () => {
  it("keeps only transactions within the window, inclusive of both ends", () => {
    const transactions = [
      tx({ id: "a", date: "2026-07-13" }),
      tx({ id: "b", date: "2026-07-14" }),
      tx({ id: "c", date: "2026-07-17" }),
      tx({ id: "d", date: "2026-07-20" }),
      tx({ id: "e", date: "2026-07-21" }),
    ];
    const window = { start: new Date(2026, 6, 14), end: new Date(2026, 6, 20, 23, 59, 59, 999) };
    const result = filterTransactionsByRange(transactions, window);
    expect(result.map((t) => t.id)).toEqual(["b", "c", "d"]);
  });
});
