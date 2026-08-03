import { describe, expect, it } from "vitest";
import { projectEventAnnotations } from "@/lib/visualization/annotations";
import type { FinancialEvent } from "@/types/event";

function event(overrides: Partial<FinancialEvent>): FinancialEvent {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    type: "salary-received",
    title: "Salary received",
    description: "",
    date: "2026-07-05",
    severity: "info",
    relatedTransactionIds: [],
    metadata: {},
    createdAt: "2026-07-05T00:00:00.000Z",
    ...overrides,
  };
}

const window = { start: new Date(2026, 5, 1), end: new Date(2026, 6, 31, 23, 59, 59, 999) };

describe("projectEventAnnotations", () => {
  it("maps a known event type to its annotation label", () => {
    const result = projectEventAnnotations([event({ type: "salary-received", date: "2026-07-05" })], window);
    expect(result).toEqual([
      { id: expect.any(String), date: "2026-07-05", month: "2026-07", label: "Salary", severity: "info" },
    ]);
  });

  it("maps every event type named in the brief's annotation list", () => {
    const types: FinancialEvent["type"][] = [
      "salary-received",
      "large-expense",
      "budget-exceeded",
      "subscription-renewing",
      "forecast-risk-increased",
      "new-merchant",
    ];
    const events = types.map((type) => event({ type, date: "2026-07-10" }));
    const result = projectEventAnnotations(events, window);
    expect(result).toHaveLength(types.length);
    expect(result.every((r) => r.label.length > 0)).toBe(true);
  });

  it("drops event types with no mapped annotation label", () => {
    const result = projectEventAnnotations([event({ type: "weekend-spending", date: "2026-07-05" })], window);
    expect(result).toEqual([]);
  });

  it("drops events outside the given window", () => {
    const result = projectEventAnnotations([event({ type: "salary-received", date: "2026-01-01" })], window);
    expect(result).toEqual([]);
  });
});
