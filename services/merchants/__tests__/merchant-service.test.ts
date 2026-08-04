// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  deleteMerchant,
  findMerchant,
  getAllMerchantProfiles,
  getMerchantProfile,
  getMerchantStatistics,
  mergeMerchant,
  registerMerchant,
} from "@/services/merchants/merchant-service";
import { createTransaction } from "@/services/transactions/transaction-service";
import type { TransactionInput } from "@/services/transactions/transaction-schema";

let organizationId: string;

vi.setConfig({ testTimeout: 20000 });

function makeTransactionInput(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    id: crypto.randomUUID(),
    amount: 100,
    note: "Test purchase",
    paymentMethod: "UPI",
    date: "2026-08-01",
    createdAt: new Date().toISOString(),
    reviewed: false,
    ...overrides,
  };
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `merchant-service-test-${Date.now()}@ledgerai.local`, name: "Merchant Service Test" },
  });
  const organization = await prisma.organization.create({
    data: { name: "Merchant Service Test Org", isPersonal: true },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
  });
  organizationId = organization.id;
}, 20000);

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { organizationId } });
  await prisma.merchant.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.transaction.deleteMany({ where: { organizationId } });
  await prisma.merchant.deleteMany({ where: { organizationId } });
});

describe("Merchant service", () => {
  it("registers a new merchant on first sight, and bumps count/confidence/aliases on repeat sightings", async () => {
    const first = await registerMerchant(organizationId, {
      canonicalName: "Swiggy",
      confidence: 0.7,
      alias: "SWIGGY*ORDER123",
    });
    expect(first.transactionCount).toBe(1);
    expect(first.aliases).toEqual(["SWIGGY*ORDER123"]);

    const second = await registerMerchant(organizationId, {
      canonicalName: "Swiggy",
      confidence: 0.95,
      alias: "SWIGGY*ORDER456",
    });
    expect(second.id).toBe(first.id);
    expect(second.transactionCount).toBe(2);
    expect(second.confidence).toBe(0.95);
    expect(second.aliases).toEqual(expect.arrayContaining(["SWIGGY*ORDER123", "SWIGGY*ORDER456"]));
  });

  it("registerMerchant enriches with rule-derived knowledge on first sight only", async () => {
    const merchant = await registerMerchant(organizationId, { canonicalName: "Amazon", confidence: 0.9 });
    const profile = await getMerchantProfile(organizationId, merchant.id);
    expect(profile).toBeDefined();
    expect(profile!.defaultCategory).toBeTruthy();
  });

  it("findMerchant matches by id, canonical name, or alias", async () => {
    const merchant = await registerMerchant(organizationId, {
      canonicalName: "Uber",
      confidence: 0.9,
      alias: "UBER*TRIP",
    });

    expect((await findMerchant(organizationId, merchant.id))?.id).toBe(merchant.id);
    expect((await findMerchant(organizationId, "uber"))?.id).toBe(merchant.id);
    expect((await findMerchant(organizationId, "uber*trip"))?.id).toBe(merchant.id);
  });

  it("mergeMerchant combines aliases/counts and atomically repoints transactions", async () => {
    const source = await registerMerchant(organizationId, { canonicalName: "Ola Cabs", confidence: 0.6, alias: "OLA*1" });
    const target = await registerMerchant(organizationId, { canonicalName: "Ola", confidence: 0.8, alias: "OLA*2" });

    await createTransaction(organizationId, makeTransactionInput({ merchantId: source.id, merchantName: source.canonicalName }));

    const merged = await mergeMerchant(organizationId, source.id, target.id);
    expect(merged.id).toBe(target.id);
    expect(merged.transactionCount).toBe(2);
    expect(merged.aliases).toEqual(expect.arrayContaining(["OLA*1", "OLA*2", "Ola Cabs"]));

    // Source merchant is gone.
    expect(await findMerchant(organizationId, source.id)).toBeUndefined();

    // The transaction originally tagged with the source merchant now
    // points at the surviving target — the exact risk-register §7.3
    // atomicity this repository was built to guarantee.
    const stored = await prisma.transaction.findFirst({ where: { organizationId } });
    expect(stored?.merchantId).toBe(target.id);
    expect(stored?.merchantName).toBe(target.canonicalName);
  });

  it("deleteMerchant clears merchant fields from referencing transactions atomically", async () => {
    const merchant = await registerMerchant(organizationId, { canonicalName: "Zomato", confidence: 0.8 });
    await createTransaction(organizationId, makeTransactionInput({ merchantId: merchant.id, merchantName: merchant.canonicalName }));

    await deleteMerchant(organizationId, merchant.id);

    expect(await findMerchant(organizationId, merchant.id)).toBeUndefined();
    const stored = await prisma.transaction.findFirst({ where: { organizationId } });
    expect(stored?.merchantId).toBeNull();
    expect(stored?.merchantName).toBeNull();

    // MerchantProfile's onDelete: Cascade removed the knowledge row too.
    const knowledge = await prisma.merchantProfile.findUnique({ where: { merchantId: merchant.id } });
    expect(knowledge).toBeNull();
  });

  it("getMerchantStatistics summarizes across all merchants", async () => {
    await registerMerchant(organizationId, { canonicalName: "Starbucks", confidence: 0.9 });
    await registerMerchant(organizationId, { canonicalName: "Starbucks", confidence: 0.9 });
    await registerMerchant(organizationId, { canonicalName: "Costa Coffee", confidence: 0.5 });

    const stats = await getMerchantStatistics(organizationId);
    expect(stats.totalMerchants).toBe(2);
    expect(stats.totalTransactions).toBe(3);
    expect(stats.topMerchants[0].canonicalName).toBe("Starbucks");
  });

  it("getAllMerchantProfiles computes spend stats from actual transactions, not the registry counter", async () => {
    const merchant = await registerMerchant(organizationId, { canonicalName: "Flipkart", confidence: 0.9 });
    await createTransaction(organizationId, makeTransactionInput({ amount: 200, merchantId: merchant.id, merchantName: merchant.canonicalName }));
    await createTransaction(organizationId, makeTransactionInput({ amount: 300, merchantId: merchant.id, merchantName: merchant.canonicalName }));

    const [profile] = await getAllMerchantProfiles(organizationId);
    expect(profile.totalSpend).toBe(500);
    expect(profile.transactionCount).toBe(2);
    expect(profile.averageTransactionAmount).toBe(250);
  });
});
