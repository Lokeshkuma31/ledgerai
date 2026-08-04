// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { generateInsights } from "@/lib/insights/engine";
import {
  completeRecommendation,
  dismissRecommendation,
  getRecommendations,
  listRecommendations,
} from "@/services/decision/decision-service";
import { addBudget, listBudgets } from "@/services/budgets/budget-service";
import { createTransaction, listTransactions } from "@/services/transactions/transaction-service";
import type { TransactionInput } from "@/services/transactions/transaction-schema";
import type { GenerateRecommendationsInput } from "@/lib/decision/engine";

let organizationId: string;

vi.setConfig({ testTimeout: 20000 });

async function buildInput(now: Date): Promise<GenerateRecommendationsInput> {
  const [transactions, budgets] = await Promise.all([
    listTransactions(organizationId),
    listBudgets(organizationId),
  ]);
  return {
    transactions,
    budgets,
    events: [],
    insights: generateInsights(transactions),
    timeline: [],
    now,
  };
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `decision-service-test-${Date.now()}@ledgerai.local`, name: "Decision Service Test" },
  });
  const organization = await prisma.organization.create({
    data: { name: "Decision Service Test Org", isPersonal: true },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
  });
  organizationId = organization.id;
}, 20000);

afterAll(async () => {
  await prisma.recommendation.deleteMany({ where: { organizationId } });
  await prisma.transaction.deleteMany({ where: { organizationId } });
  await prisma.budget.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.recommendation.deleteMany({ where: { organizationId } });
  await prisma.transaction.deleteMany({ where: { organizationId } });
  await prisma.budget.deleteMany({ where: { organizationId } });
});

describe("Recommendation (Decision) service", () => {
  it("getRecommendations persists a freshly generated budget-reduce recommendation", async () => {
    await addBudget(organizationId, { category: "Food", monthlyLimit: 1000 });
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
    const input: TransactionInput = {
      id: crypto.randomUUID(),
      amount: 950,
      note: "Groceries",
      paymentMethod: "Cash",
      date: thisMonth,
      createdAt: new Date().toISOString(),
      userCategory: "Food",
      reviewed: true,
    };
    await createTransaction(organizationId, input);

    const recs = await getRecommendations(organizationId, await buildInput(now));
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].category).toBe("Budget");
    expect(recs[0].status).toBe("new");

    const listed = await listRecommendations(organizationId);
    expect(listed).toHaveLength(recs.length);
  });

  it("dismissing a recommendation survives regeneration, mirroring applyPersistedStatus", async () => {
    await addBudget(organizationId, { category: "Transport", monthlyLimit: 500 });
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-10`;
    await createTransaction(organizationId, {
      id: crypto.randomUUID(),
      amount: 480,
      note: "Cab rides",
      paymentMethod: "UPI",
      date: thisMonth,
      createdAt: new Date().toISOString(),
      userCategory: "Transport",
      reviewed: true,
    });

    const first = await getRecommendations(organizationId, await buildInput(now));
    const target = first.find((r) => r.category === "Budget")!;
    expect(target).toBeDefined();

    await dismissRecommendation(organizationId, target.id);

    // Regenerate — the same deterministic id should come back dismissed,
    // with its original createdAt preserved, not reset to "new".
    const second = await getRecommendations(organizationId, await buildInput(now));
    const stillThere = second.find((r) => r.id === target.id)!;
    expect(stillThere.status).toBe("dismissed");
    expect(stillThere.createdAt).toBe(target.createdAt);
  });

  it("completeRecommendation marks it completed", async () => {
    await addBudget(organizationId, { category: "Shopping", monthlyLimit: 100 });
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-05`;
    await createTransaction(organizationId, {
      id: crypto.randomUUID(),
      amount: 150,
      note: "New shoes",
      paymentMethod: "Credit Card",
      date: thisMonth,
      createdAt: new Date().toISOString(),
      userCategory: "Shopping",
      reviewed: true,
    });

    const recs = await getRecommendations(organizationId, await buildInput(now));
    const target = recs.find((r) => r.category === "Budget")!;
    await completeRecommendation(organizationId, target.id);

    const listed = await listRecommendations(organizationId);
    expect(listed.find((r) => r.id === target.id)?.status).toBe("completed");
  });
});
