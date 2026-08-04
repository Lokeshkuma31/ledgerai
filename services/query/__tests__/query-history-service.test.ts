// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addToQueryHistory,
  clearQueryHistory,
  deleteFromQueryHistory,
  getQueryHistory,
} from "@/services/query/query-history-service";
import type { QueryResult } from "@/types/query";

const organizationId = `query-history-test-${crypto.randomUUID()}`;

vi.setConfig({ testTimeout: 20000 });

function makeResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    id: crypto.randomUUID(),
    question: "How much did I spend on Food this month?",
    intent: "spending-summary",
    answer: "You spent ₹4,500 on Food this month.",
    context: { transactionIds: [], merchantIds: [], categories: ["Food"], dateRange: null },
    createdAt: new Date().toISOString(),
    ...overrides,
  } as QueryResult;
}

beforeEach(async () => {
  await clearQueryHistory(organizationId);
});

afterAll(async () => {
  await clearQueryHistory(organizationId);
});

describe("Query History service (Redis)", () => {
  it("addToQueryHistory prepends, newest first", async () => {
    const first = makeResult({ question: "First question" });
    const second = makeResult({ question: "Second question" });
    await addToQueryHistory(organizationId, first);
    await addToQueryHistory(organizationId, second);

    const history = await getQueryHistory(organizationId);
    expect(history.map((r) => r.question)).toEqual(["Second question", "First question"]);
  });

  it("caps history at 50 entries", async () => {
    for (let i = 0; i < 55; i += 1) {
      await addToQueryHistory(organizationId, makeResult({ question: `Q${i}` }));
    }
    const history = await getQueryHistory(organizationId);
    expect(history).toHaveLength(50);
    // Newest (Q54) first, oldest kept (Q5) last — Q0-Q4 fell off the cap.
    expect(history[0].question).toBe("Q54");
    expect(history[49].question).toBe("Q5");
  }, 90000);

  it("deleteFromQueryHistory removes only the matching entry, preserving order", async () => {
    const a = makeResult({ question: "A" });
    const b = makeResult({ question: "B" });
    const c = makeResult({ question: "C" });
    await addToQueryHistory(organizationId, a);
    await addToQueryHistory(organizationId, b);
    await addToQueryHistory(organizationId, c);

    await deleteFromQueryHistory(organizationId, b.id);

    const history = await getQueryHistory(organizationId);
    expect(history.map((r) => r.question)).toEqual(["C", "A"]);
  });

  it("clearQueryHistory empties the list", async () => {
    await addToQueryHistory(organizationId, makeResult());
    await clearQueryHistory(organizationId);
    expect(await getQueryHistory(organizationId)).toHaveLength(0);
  });
});
