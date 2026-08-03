import { describe, expect, it } from "vitest";
import {
  bucketByCategory,
  bucketByDay,
  bucketByDayOfWeek,
  buildBudgetBurnRateSeries,
  buildCashFlowSeries,
  resolveCashFlowMonthsBack,
  toNetSeries,
} from "@/lib/visualization/aggregator";
import type { Budget } from "@/types/budget";
import type { Transaction } from "@/types/transaction";

function budget(overrides: Partial<Budget>): Budget {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    category: "Food",
    monthlyLimit: 1000,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

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

describe("bucketByCategory", () => {
  it("sums amounts per effective category, sorted descending by total", () => {
    const transactions = [
      tx({ amount: 100, userCategory: "Food" }),
      tx({ amount: 50, userCategory: "Food" }),
      tx({ amount: 200, aiCategory: "Travel" }),
    ];
    const result = bucketByCategory(transactions);
    expect(result).toEqual([
      { category: "Travel", total: 200, percentage: (200 / 350) * 100 },
      { category: "Food", total: 150, percentage: (150 / 350) * 100 },
    ]);
  });

  it("falls back to 'Other' when no category is set", () => {
    const result = bucketByCategory([tx({ amount: 10 })]);
    expect(result).toEqual([{ category: "Other", total: 10, percentage: 100 }]);
  });

  it("returns an empty array for no transactions", () => {
    expect(bucketByCategory([])).toEqual([]);
  });
});

describe("buildCashFlowSeries", () => {
  it("delegates to generateMonthlyCashFlow without altering its output", () => {
    const now = new Date(2026, 6, 20);
    const transactions = [tx({ date: "2026-07-05", amount: 500, aiCategory: "Salary" })];
    const result = buildCashFlowSeries(transactions, 1, now);
    expect(result).toEqual([{ month: "2026-07", label: "Jul", income: 500, expense: 0 }]);
  });
});

describe("resolveCashFlowMonthsBack", () => {
  it("spans the resolved window when no transactions predate it", () => {
    const window = { start: new Date(2026, 4, 1), end: new Date(2026, 6, 20) };
    expect(resolveCashFlowMonthsBack(window, [])).toBe(3); // May, Jun, Jul
  });

  it("caps at 24 months for an 'all time' window even with an old transaction", () => {
    const window = { start: new Date(1970, 0, 1), end: new Date(2026, 6, 20) };
    const transactions = [tx({ date: "2020-01-01" })];
    expect(resolveCashFlowMonthsBack(window, transactions)).toBe(24);
  });

  it("never returns fewer than 1 month", () => {
    const window = { start: new Date(2026, 6, 20), end: new Date(2026, 6, 20) };
    expect(resolveCashFlowMonthsBack(window, [])).toBe(1);
  });
});

describe("bucketByDayOfWeek", () => {
  it("sums amounts per weekday (Sun..Sat), leaving unused days at zero", () => {
    const transactions = [
      tx({ date: "2026-07-15", amount: 100 }), // Wednesday
      tx({ date: "2026-07-16", amount: 50 }), // Thursday
      tx({ date: "2026-07-22", amount: 25 }), // following Wednesday
    ];
    const result = bucketByDayOfWeek(transactions);
    expect(result).toHaveLength(7);
    expect(result[3]).toEqual({ key: "3", label: "Wed", total: 125, count: 2 });
    expect(result[4]).toEqual({ key: "4", label: "Thu", total: 50, count: 1 });
    expect(result[0]).toEqual({ key: "0", label: "Sun", total: 0, count: 0 });
  });
});

describe("bucketByDay", () => {
  it("sums amounts per calendar day, sorted chronologically", () => {
    const transactions = [
      tx({ date: "2026-07-16", amount: 10 }),
      tx({ date: "2026-07-15", amount: 20 }),
      tx({ date: "2026-07-15", amount: 5 }),
    ];
    expect(bucketByDay(transactions)).toEqual([
      { key: "2026-07-15", label: "2026-07-15", total: 25, count: 2 },
      { key: "2026-07-16", label: "2026-07-16", total: 10, count: 1 },
    ]);
  });
});

describe("buildBudgetBurnRateSeries", () => {
  it("computes percentageUsed per budget category for each trailing month", () => {
    const now = new Date(2026, 6, 20);
    const budgets = [budget({ category: "Food", monthlyLimit: 1000 })];
    const transactions = [
      tx({ date: "2026-06-05", amount: 300, userCategory: "Food" }),
      tx({ date: "2026-07-10", amount: 800, userCategory: "Food" }),
    ];
    const result = buildBudgetBurnRateSeries(budgets, transactions, 2, now);
    expect(result).toEqual([
      { month: "2026-06", label: "Jun", Food: 30 },
      { month: "2026-07", label: "Jul", Food: 80 },
    ]);
  });

  it("returns no category keys when there are no budgets", () => {
    const now = new Date(2026, 6, 20);
    const result = buildBudgetBurnRateSeries([], [], 1, now);
    expect(result).toEqual([{ month: "2026-07", label: "Jul" }]);
  });
});

describe("toNetSeries", () => {
  it("derives net as income minus expense per month", () => {
    const series = [
      { month: "2026-06", label: "Jun", income: 100, expense: 40 },
      { month: "2026-07", label: "Jul", income: 200, expense: 250 },
    ];
    expect(toNetSeries(series)).toEqual([
      { month: "2026-06", label: "Jun", net: 60 },
      { month: "2026-07", label: "Jul", net: -50 },
    ]);
  });
});
