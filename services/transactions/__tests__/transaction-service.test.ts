// @vitest-environment node
//
// Postgres-backed via the Neon serverless driver (real Node WebSocket),
// which conflicts with jsdom's own Event/WebSocket globals — this file
// overrides back to the plain Node environment, same as
// lib/connections/__tests__/engine.test.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  createTransaction,
  createTransactions,
  listTransactions,
  reassignMerchant,
  clearMerchantFromTransactions,
  reviewTransaction,
} from "@/services/transactions/transaction-service";
import type { TransactionInput } from "@/services/transactions/transaction-schema";

let organizationId: string;

// Real network round-trips against Neon (incl. cold-start latency) make
// this suite slower than the 5s default per-test timeout.
vi.setConfig({ testTimeout: 20000 });

function makeInput(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    id: crypto.randomUUID(),
    amount: 450,
    note: "Swiggy order",
    paymentMethod: "UPI",
    date: "2026-08-01",
    createdAt: new Date().toISOString(),
    aiCategory: "Food",
    confidence: 0.95,
    classificationSource: "classifier",
    reviewed: false,
    ...overrides,
  };
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `transaction-service-test-${Date.now()}@ledgerai.local`, name: "Transaction Service Test" },
  });
  const organization = await prisma.organization.create({
    data: { name: "Transaction Service Test Org", isPersonal: true },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
  });
  organizationId = organization.id;
}, 20000);

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.transaction.deleteMany({ where: { organizationId } });
});

describe("Transaction service", () => {
  it("creates a transaction and round-trips amount/category/paymentMethod exactly", async () => {
    const created = await createTransaction(organizationId, makeInput({ amount: 450.5, userCategory: "Food" }));

    expect(created.amount).toBe(450.5);
    expect(created.paymentMethod).toBe("UPI");
    expect(created.aiCategory).toBe("Food");
    expect(created.userCategory).toBe("Food");
    expect(created.reviewed).toBe(false);
    expect(created.date).toBe("2026-08-01");

    const [listed] = await listTransactions(organizationId);
    expect(listed.id).toBe(created.id);
  });

  it("sorts by date desc, then createdAt desc, matching lib/storage.ts::sortTransactions", async () => {
    await createTransaction(organizationId, makeInput({ date: "2026-08-01", createdAt: "2026-08-01T10:00:00.000Z" }));
    await createTransaction(organizationId, makeInput({ date: "2026-08-03", createdAt: "2026-08-03T10:00:00.000Z" }));
    await createTransaction(organizationId, makeInput({ date: "2026-08-02", createdAt: "2026-08-02T10:00:00.000Z" }));

    const list = await listTransactions(organizationId);
    expect(list.map((t) => t.date)).toEqual(["2026-08-03", "2026-08-02", "2026-08-01"]);
  });

  it("createTransactions persists a batch in one call, mirroring addTransactions", async () => {
    const inputs = [makeInput(), makeInput({ note: "Uber ride", aiCategory: "Transport" })];
    const created = await createTransactions(organizationId, inputs);

    expect(created).toHaveLength(2);
    const list = await listTransactions(organizationId);
    expect(list).toHaveLength(2);
  });

  it("rejects an unknown category rather than silently dropping it", async () => {
    await expect(
      createTransaction(organizationId, makeInput({ aiCategory: "NotACategory" })),
    ).rejects.toThrow(/Unknown category/);
  });

  it("reviewTransaction marks reviewed and persists the chosen category", async () => {
    const created = await createTransaction(organizationId, makeInput({ aiCategory: "Food" }));
    const reviewed = await reviewTransaction(organizationId, created.id, "Transport");

    expect(reviewed.reviewed).toBe(true);
    expect(reviewed.userCategory).toBe("Transport");
  });

  it("reassignMerchant repoints every transaction tagged with the old merchant id", async () => {
    const merchant = await prisma.merchant.create({
      data: {
        organizationId,
        canonicalName: "Old Merchant",
        firstSeen: new Date(),
        lastSeen: new Date(),
        confidence: 0.9,
      },
    });
    const targetMerchant = await prisma.merchant.create({
      data: {
        organizationId,
        canonicalName: "Merged Merchant",
        firstSeen: new Date(),
        lastSeen: new Date(),
        confidence: 0.9,
      },
    });
    const created = await createTransaction(
      organizationId,
      makeInput({ merchantId: merchant.id, merchantName: "Old Merchant" }),
    );

    await reassignMerchant(organizationId, merchant.id, targetMerchant.id, "Merged Merchant");

    const [updated] = await listTransactions(organizationId);
    expect(updated.id).toBe(created.id);
    expect(updated.merchantId).toBe(targetMerchant.id);
    expect(updated.merchantName).toBe("Merged Merchant");

    await prisma.merchant.deleteMany({ where: { id: { in: [merchant.id, targetMerchant.id] } } });
  });

  it("clearMerchantFromTransactions wipes merchant fields after a merchant is deleted", async () => {
    const merchant = await prisma.merchant.create({
      data: {
        organizationId,
        canonicalName: "Deletable Merchant",
        firstSeen: new Date(),
        lastSeen: new Date(),
        confidence: 0.9,
      },
    });
    await createTransaction(organizationId, makeInput({ merchantId: merchant.id, merchantName: "Deletable Merchant" }));

    await clearMerchantFromTransactions(organizationId, merchant.id);

    const [updated] = await listTransactions(organizationId);
    expect(updated.merchantId).toBeUndefined();
    expect(updated.merchantName).toBeUndefined();

    await prisma.merchant.delete({ where: { id: merchant.id } });
  });
});
