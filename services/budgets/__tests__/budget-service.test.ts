// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  addBudget,
  deleteBudget,
  getBudgetStatuses,
  listBudgets,
  updateBudgetLimit,
} from "@/services/budgets/budget-service";
import { createTransaction } from "@/services/transactions/transaction-service";
import type { TransactionInput } from "@/services/transactions/transaction-schema";

let organizationId: string;

vi.setConfig({ testTimeout: 20000 });

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `budget-service-test-${Date.now()}@ledgerai.local`, name: "Budget Service Test" },
  });
  const organization = await prisma.organization.create({
    data: { name: "Budget Service Test Org", isPersonal: true },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
  });
  organizationId = organization.id;
}, 20000);

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { organizationId } });
  await prisma.budget.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.transaction.deleteMany({ where: { organizationId } });
  await prisma.budget.deleteMany({ where: { organizationId } });
});

describe("Budget service", () => {
  it("adds a budget and lists it back", async () => {
    const budget = await addBudget(organizationId, { category: "Food", monthlyLimit: 5000 });
    expect(budget.category).toBe("Food");
    expect(budget.monthlyLimit).toBe(5000);

    const list = await listBudgets(organizationId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(budget.id);
  });

  it("rejects a second budget for the same category, mirroring lib/budget/storage.ts::addBudget", async () => {
    await addBudget(organizationId, { category: "Transport", monthlyLimit: 2000 });
    await expect(
      addBudget(organizationId, { category: "Transport", monthlyLimit: 3000 }),
    ).rejects.toThrow(/already exists/);
  });

  it("updateBudgetLimit changes only the limit", async () => {
    const budget = await addBudget(organizationId, { category: "Shopping", monthlyLimit: 1000 });
    const updated = await updateBudgetLimit(organizationId, { id: budget.id, monthlyLimit: 1500 });
    expect(updated.id).toBe(budget.id);
    expect(updated.monthlyLimit).toBe(1500);
    expect(updated.category).toBe("Shopping");
  });

  it("deleteBudget removes it", async () => {
    const budget = await addBudget(organizationId, { category: "Health", monthlyLimit: 800 });
    await deleteBudget(organizationId, budget.id);
    expect(await listBudgets(organizationId)).toHaveLength(0);
  });

  it("getBudgetStatuses joins budgets against real transactions for the current month, matching lib/budget/engine.ts", async () => {
    await addBudget(organizationId, { category: "Food", monthlyLimit: 1000 });

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
    const input: TransactionInput = {
      id: crypto.randomUUID(),
      amount: 850,
      note: "Groceries",
      paymentMethod: "Cash",
      date: thisMonth,
      createdAt: new Date().toISOString(),
      userCategory: "Food",
      reviewed: true,
    };
    await createTransaction(organizationId, input);

    const [status] = await getBudgetStatuses(organizationId, now);
    expect(status.category).toBe("Food");
    expect(status.currentSpend).toBe(850);
    expect(status.remainingAmount).toBe(150);
    expect(status.status).toBe("warning");
  });
});
