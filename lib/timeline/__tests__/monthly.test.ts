import { describe, expect, it } from "vitest";
import { generateMonthlyCashFlow } from "@/lib/timeline/monthly";
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

describe("generateMonthlyCashFlow", () => {
  it("returns one bucket per requested month, oldest first", () => {
    const now = new Date(2026, 6, 20); // Jul 20, 2026
    const result = generateMonthlyCashFlow([], 3, now);
    expect(result.map((m) => m.month)).toEqual(["2026-05", "2026-06", "2026-07"]);
  });

  it("buckets income and expense by month using the shared income heuristic", () => {
    const now = new Date(2026, 6, 20);
    const transactions = [
      tx({ date: "2026-07-05", amount: 500, aiCategory: "Salary" }),
      tx({ date: "2026-07-10", amount: 120, aiCategory: "Food" }),
      tx({ date: "2026-06-01", amount: 50, aiCategory: "Transport" }),
    ];
    const result = generateMonthlyCashFlow(transactions, 2, now);
    const june = result.find((m) => m.month === "2026-06")!;
    const july = result.find((m) => m.month === "2026-07")!;
    expect(june).toEqual({ month: "2026-06", label: "Jun", income: 0, expense: 50 });
    expect(july.income).toBe(500);
    expect(july.expense).toBe(120);
  });

  it("ignores transactions outside the requested window", () => {
    const now = new Date(2026, 6, 20);
    const transactions = [tx({ date: "2025-01-01", amount: 999 })];
    const result = generateMonthlyCashFlow(transactions, 2, now);
    const total = result.reduce((sum, m) => sum + m.income + m.expense, 0);
    expect(total).toBe(0);
  });
});
