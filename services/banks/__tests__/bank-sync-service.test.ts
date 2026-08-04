// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { registerConnector, unregisterConnector } from "@/lib/banks/registry";
import type { BankConnector } from "@/lib/banks/connector";
import type { BankAccount, ConnectorHealth } from "@/lib/banks/types";
import {
  clearConnectorState,
  getAllConnectorRecords,
  getEnabledConnectors,
  isConnectorEnabled,
  markAccountsStatus,
  recordConnectorConnection,
  recordConnectorHealth,
  recordConnectorLastSync,
  registerConnectorState,
  setConnectorEnabled,
  upsertAccounts,
} from "@/services/banks/bank-sync-service";

let organizationId: string;
const CONNECTOR_ID = "test-hdfc";

vi.setConfig({ testTimeout: 20000 });

function makeConnector(): BankConnector {
  return {
    id: CONNECTOR_ID,
    name: "Test HDFC",
    country: "IN",
    institution: "HDFC Bank",
    version: "1.0.0",
    supportedAccounts: () => ["checking", "savings"],
    supportedFeatures: () => ["transaction-sync", "balance-sync"],
    authenticate: async () => {},
    disconnect: async () => {},
    refresh: async () => {},
    sync: async () => ({ accounts: [], transactions: [] }),
    health: async () => ({ status: "healthy", message: "OK", checkedAt: new Date().toISOString() }),
    status: async () => ({ connection: "connected", updatedAt: new Date().toISOString() }),
    metadata: () => ({ description: "Test connector" }),
  };
}

function makeAccount(overrides: Partial<BankAccount> = {}): BankAccount {
  return {
    id: `${CONNECTOR_ID}-checking`,
    institution: "HDFC Bank",
    accountName: "Primary Checking",
    accountType: "checking",
    maskedNumber: "****1234",
    currency: "INR",
    balance: 50000,
    availableBalance: 48000,
    lastSynced: new Date().toISOString(),
    status: "active",
    metadata: {},
    ...overrides,
  };
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `bank-sync-service-test-${Date.now()}@ledgerai.local`, name: "Bank Sync Service Test" },
  });
  const organization = await prisma.organization.create({
    data: { name: "Bank Sync Service Test Org", isPersonal: true },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
  });
  organizationId = organization.id;
}, 20000);

afterAll(async () => {
  await prisma.bankAccount.deleteMany({ where: { organizationId } });
  await prisma.bankConnectorState.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  registerConnector(makeConnector());
  await registerConnectorState(organizationId, makeConnector());
});

afterEach(async () => {
  unregisterConnector(CONNECTOR_ID);
  await prisma.bankAccount.deleteMany({ where: { organizationId } });
  await prisma.bankConnectorState.deleteMany({ where: { organizationId } });
});

describe("Bank Sync service", () => {
  it("registerConnectorState seeds enabled=true on first registration only", async () => {
    expect(await isConnectorEnabled(organizationId, CONNECTOR_ID)).toBe(true);

    await setConnectorEnabled(organizationId, CONNECTOR_ID, false);
    // Re-registering (e.g. a hot-reload re-register) must not clobber the
    // user's own enabled choice — mirrors the original's `if (!state[id])` guard.
    await registerConnectorState(organizationId, makeConnector());
    expect(await isConnectorEnabled(organizationId, CONNECTOR_ID)).toBe(false);
  });

  it("setConnectorEnabled toggles and getEnabledConnectors reflects it", async () => {
    await setConnectorEnabled(organizationId, CONNECTOR_ID, true);
    expect((await getEnabledConnectors(organizationId)).map((c) => c.id)).toContain(CONNECTOR_ID);

    await setConnectorEnabled(organizationId, CONNECTOR_ID, false);
    expect((await getEnabledConnectors(organizationId)).map((c) => c.id)).not.toContain(CONNECTOR_ID);
  });

  it("setConnectorEnabled rejects an unknown connector id", async () => {
    await expect(setConnectorEnabled(organizationId, "does-not-exist", true)).rejects.toThrow(
      /unknown connector/,
    );
  });

  it("recordConnectorHealth/Connection/LastSync persist and surface via getAllConnectorRecords", async () => {
    const health: ConnectorHealth = { status: "healthy", message: "All good", checkedAt: new Date().toISOString() };
    await recordConnectorHealth(organizationId, CONNECTOR_ID, health);
    await recordConnectorConnection(organizationId, CONNECTOR_ID, "connected");
    const lastSync = new Date().toISOString();
    await recordConnectorLastSync(organizationId, CONNECTOR_ID, lastSync);

    const records = await getAllConnectorRecords(organizationId);
    const record = records.find((r) => r.id === CONNECTOR_ID)!;
    expect(record.health).toEqual(health);
    expect(record.connection).toBe("connected");
    expect(record.lastSync).toBe(lastSync);
    expect(record.supportedAccounts).toEqual(["checking", "savings"]);
  });

  it("upsertAccounts replaces the connector's accounts wholesale, not merges", async () => {
    await upsertAccounts(organizationId, CONNECTOR_ID, [makeAccount({ id: "acc-1" }), makeAccount({ id: "acc-2" })]);
    await upsertAccounts(organizationId, CONNECTOR_ID, [makeAccount({ id: "acc-3" })]);

    const accounts = await prisma.bankAccount.findMany({ where: { organizationId, connectorId: CONNECTOR_ID } });
    expect(accounts.map((a) => a.id)).toEqual(["acc-3"]);
  });

  it("markAccountsStatus flips status without discarding balances", async () => {
    await upsertAccounts(organizationId, CONNECTOR_ID, [makeAccount({ id: "acc-1", balance: 12345 })]);
    await markAccountsStatus(organizationId, CONNECTOR_ID, "error");

    const accounts = await prisma.bankAccount.findMany({ where: { organizationId, connectorId: CONNECTOR_ID } });
    expect(accounts[0].status).toBe("ERROR");
    expect(accounts[0].balance.toNumber()).toBe(12345);
  });

  it("clearConnectorState wipes both state and accounts for the organization", async () => {
    await upsertAccounts(organizationId, CONNECTOR_ID, [makeAccount()]);
    await clearConnectorState(organizationId);

    expect(await prisma.bankConnectorState.count({ where: { organizationId } })).toBe(0);
    expect(await prisma.bankAccount.count({ where: { organizationId } })).toBe(0);
  });
});
