import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAccountsForConnector,
  getAllConnectorRecords,
  getConnector,
  getConnectorRecord,
  isConnectorEnabled,
  recordConnectorHealth,
  registerConnector,
  setConnectorEnabled,
  unregisterConnector,
  upsertAccounts,
} from "@/lib/banks/registry";
import type { BankConnector } from "@/lib/banks/connector";
import type { BankAccount } from "@/lib/banks/types";

function fakeConnector(id: string): BankConnector {
  return {
    id,
    name: `Fake ${id}`,
    country: "IN",
    institution: `Fake Institution ${id}`,
    version: "1.0.0",
    supportedAccounts: () => ["checking"],
    supportedFeatures: () => ["transaction-sync"],
    authenticate: async () => {},
    disconnect: async () => {},
    refresh: async () => {},
    sync: async () => ({ accounts: [], transactions: [] }),
    health: async () => ({ status: "healthy", message: "ok", checkedAt: new Date().toISOString() }),
    status: async () => ({ connection: "connected", updatedAt: new Date().toISOString() }),
    metadata: () => ({ description: "A fake connector for registry tests." }),
  };
}

function account(id: string): BankAccount {
  return {
    id,
    institution: "Fake Institution",
    accountName: "Test Account",
    accountType: "checking",
    maskedNumber: "XXXX0000",
    currency: "INR",
    balance: 100,
    availableBalance: 100,
    lastSynced: null,
    status: "active",
    metadata: {},
  };
}

const TEST_ID = "registry-test-connector";

beforeEach(() => {
  localStorage.clear();
  registerConnector(fakeConnector(TEST_ID));
});

afterEach(() => {
  unregisterConnector(TEST_ID);
});

describe("registerConnector / getConnector", () => {
  it("registers a connector and makes it retrievable", () => {
    expect(getConnector(TEST_ID)?.id).toBe(TEST_ID);
  });

  it("throws when registering the same id twice", () => {
    expect(() => registerConnector(fakeConnector(TEST_ID))).toThrow(/already registered/);
  });

  it("is enabled by default the moment it's registered", () => {
    expect(isConnectorEnabled(TEST_ID)).toBe(true);
  });
});

describe("setConnectorEnabled", () => {
  it("toggles enabled state, reflected in both isConnectorEnabled and the record", () => {
    setConnectorEnabled(TEST_ID, false);
    expect(isConnectorEnabled(TEST_ID)).toBe(false);
    expect(getConnectorRecord(TEST_ID)?.enabled).toBe(false);

    setConnectorEnabled(TEST_ID, true);
    expect(isConnectorEnabled(TEST_ID)).toBe(true);
  });
});

describe("recordConnectorHealth / getAllConnectorRecords", () => {
  it("reflects the most recently recorded health in the connector's record", () => {
    const health = { status: "warning" as const, message: "test warning", checkedAt: new Date().toISOString() };
    recordConnectorHealth(TEST_ID, health);
    const record = getAllConnectorRecords().find((r) => r.id === TEST_ID);
    expect(record?.health).toEqual(health);
  });
});

describe("accounts", () => {
  it("stores and retrieves accounts per connector", () => {
    upsertAccounts(TEST_ID, [account("acc-1"), account("acc-2")]);
    expect(getAccountsForConnector(TEST_ID)).toHaveLength(2);
  });

  it("replaces the full account list on each upsert rather than merging", () => {
    upsertAccounts(TEST_ID, [account("acc-1"), account("acc-2")]);
    upsertAccounts(TEST_ID, [account("acc-1")]);
    expect(getAccountsForConnector(TEST_ID).map((a) => a.id)).toEqual(["acc-1"]);
  });
});

describe("unregisterConnector", () => {
  it("removes the connector and its accounts", () => {
    upsertAccounts(TEST_ID, [account("acc-1")]);
    unregisterConnector(TEST_ID);
    expect(getConnector(TEST_ID)).toBeUndefined();
    expect(getAccountsForConnector(TEST_ID)).toEqual([]);
    // Re-register so afterEach's unregister (and any later test in this
    // file expecting it to exist) isn't left in a broken state.
    registerConnector(fakeConnector(TEST_ID));
  });
});
