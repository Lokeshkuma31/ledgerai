// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  findRecurring,
  listRecurring,
  pauseRecurring,
  resumeRecurring,
} from "@/services/recurring/recurring-service";
import * as recurringRepository from "@/repositories/recurring-repository";
import { createTransaction } from "@/services/transactions/transaction-service";
import type { TransactionInput } from "@/services/transactions/transaction-schema";
import type { RecurringTransaction } from "@/types/recurring";

let organizationId: string;

vi.setConfig({ testTimeout: 20000 });

function makeRecurringItem(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
  const now = new Date().toISOString();
  return {
    id: "recurring:netflix",
    title: "Netflix",
    category: "Entertainment",
    frequency: "Monthly",
    averageAmount: 500,
    minimumAmount: 500,
    maximumAmount: 500,
    lastAmount: 500,
    lastOccurrence: "2026-07-01",
    nextExpectedOccurrence: "2026-08-01",
    daysRemaining: 5,
    confidence: 0.95,
    transactionCount: 3,
    isSubscription: true,
    isIncome: false,
    isExpense: true,
    status: "Active",
    relatedTransactionIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function makeTransaction(): Promise<string> {
  const input: TransactionInput = {
    id: crypto.randomUUID(),
    amount: 500,
    note: "Netflix",
    paymentMethod: "Credit Card",
    date: "2026-07-01",
    createdAt: new Date().toISOString(),
    reviewed: false,
  };
  const created = await createTransaction(organizationId, input);
  return created.id;
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `recurring-service-test-${Date.now()}@ledgerai.local`, name: "Recurring Service Test" },
  });
  const organization = await prisma.organization.create({
    data: { name: "Recurring Service Test Org", isPersonal: true },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
  });
  organizationId = organization.id;
}, 20000);

afterAll(async () => {
  await prisma.recurringOverride.deleteMany({ where: { recurring: { organizationId } } });
  await prisma.recurringTransactionTransaction.deleteMany({ where: { recurring: { organizationId } } });
  await prisma.recurringTransaction.deleteMany({ where: { organizationId } });
  await prisma.transaction.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.recurringOverride.deleteMany({ where: { recurring: { organizationId } } });
  await prisma.recurringTransactionTransaction.deleteMany({ where: { recurring: { organizationId } } });
  await prisma.recurringTransaction.deleteMany({ where: { organizationId } });
  await prisma.transaction.deleteMany({ where: { organizationId } });
});

describe("Recurring service", () => {
  it("reconcileRecurring creates a newly detected item and links relatedTransactionIds via the join table", async () => {
    const txId = await makeTransaction();
    const fresh = makeRecurringItem({ relatedTransactionIds: [txId] });

    const result = await recurringRepository.reconcileRecurring(organizationId, [fresh]);

    expect(result.newlyDetected).toHaveLength(1);
    expect(result.newlyDetected[0].id).toBe("recurring:netflix");
    expect(result.items[0].relatedTransactionIds).toEqual([txId]);

    const found = await findRecurring(organizationId, "recurring:netflix");
    expect(found?.relatedTransactionIds).toEqual([txId]);
  });

  it("reconcileRecurring preserves createdAt and detects amount changes on reconciliation", async () => {
    const txId = await makeTransaction();
    const first = makeRecurringItem({ relatedTransactionIds: [txId], createdAt: "2026-06-01T00:00:00.000Z" });
    const firstResult = await recurringRepository.reconcileRecurring(organizationId, [first]);
    const originalCreatedAt = firstResult.items[0].createdAt;

    // A big amount jump (well beyond the 15% tolerance) on a later occurrence.
    const second = makeRecurringItem({
      relatedTransactionIds: [txId],
      lastAmount: 900,
      lastOccurrence: "2026-08-01",
      createdAt: new Date().toISOString(),
    });
    const secondResult = await recurringRepository.reconcileRecurring(organizationId, [second]);

    expect(secondResult.newlyDetected).toHaveLength(0);
    expect(secondResult.amountChanges).toHaveLength(1);
    expect(secondResult.amountChanges[0].previousAmount).toBe(500);
    expect(secondResult.items[0].createdAt).toBe(originalCreatedAt);
    expect(secondResult.items[0].lastAmount).toBe(900);
  });

  it("pauseRecurring overrides status, and reconcile re-applies the override over a fresh Active detection", async () => {
    const fresh = makeRecurringItem();
    await recurringRepository.reconcileRecurring(organizationId, [fresh]);

    await pauseRecurring(organizationId, "recurring:netflix");
    const paused = await findRecurring(organizationId, "recurring:netflix");
    expect(paused?.status).toBe("Paused");

    // Fresh detection still says "Active" — the override should win.
    const reconciled = await recurringRepository.reconcileRecurring(organizationId, [
      makeRecurringItem({ status: "Active" }),
    ]);
    expect(reconciled.items[0].status).toBe("Paused");
  });

  it("resumeRecurring clears the override so the next reconcile uses the fresh status", async () => {
    const fresh = makeRecurringItem();
    await recurringRepository.reconcileRecurring(organizationId, [fresh]);
    await pauseRecurring(organizationId, "recurring:netflix");
    await resumeRecurring(organizationId, "recurring:netflix");

    const reconciled = await recurringRepository.reconcileRecurring(organizationId, [
      makeRecurringItem({ status: "Active" }),
    ]);
    expect(reconciled.items[0].status).toBe("Active");
  });

  it("listRecurring returns everything for the organization", async () => {
    await recurringRepository.reconcileRecurring(organizationId, [
      makeRecurringItem({ id: "recurring:netflix" }),
      makeRecurringItem({ id: "recurring:spotify", title: "Spotify" }),
    ]);
    const all = await listRecurring(organizationId);
    expect(all.map((r) => r.id).sort()).toEqual(["recurring:netflix", "recurring:spotify"]);
  });
});
