import { beforeEach, describe, expect, it } from "vitest";
import "@/plugins/account-aggregator/connector";
import { ACCOUNT_AGGREGATOR_CONNECTOR_ID, createAccountAggregatorConnector } from "@/plugins/account-aggregator/connector";
import { getConnector, registerConnector, setConnectorEnabled, unregisterConnector } from "@/lib/banks/registry";
import { getSyncHistory, runSync } from "@/lib/banks/sync-engine";
import { getConsent } from "@/plugins/account-aggregator/consent";
import type { AAScenarioOptions } from "@/plugins/account-aggregator/types";

const ID = ACCOUNT_AGGREGATOR_CONNECTOR_ID;

function useConnector(options?: AAScenarioOptions) {
  localStorage.clear();
  unregisterConnector(ID);
  registerConnector(createAccountAggregatorConnector(options));
  setConnectorEnabled(ID, true);
}

describe("Consent Granted", () => {
  beforeEach(() => useConnector());

  it("authenticate() grants consent, discovers every account, and connects", async () => {
    await getConnector(ID)!.authenticate();
    const consent = getConsent();
    expect(consent?.status).toBe("Granted");
    expect(consent?.linkedAccounts).toHaveLength(4);
    expect((await getConnector(ID)!.status()).connection).toBe("connected");
    expect((await getConnector(ID)!.health()).status).toBe("healthy");
  });
});

describe("Consent Denied", () => {
  beforeEach(() => useConnector({ denyConsent: true }));

  it("rejects authenticate() and records a Denied consent", async () => {
    await expect(getConnector(ID)!.authenticate()).rejects.toThrow(/denied/i);
    expect(getConsent()?.status).toBe("Denied");
    expect((await getConnector(ID)!.status()).connection).toBe("error");
  });
});

describe("Consent Expired", () => {
  beforeEach(() => useConnector({ expireConsentImmediately: true }));

  it("leaves the connector reauthentication-required and fails any sync attempt", async () => {
    await getConnector(ID)!.authenticate();
    expect((await getConnector(ID)!.status()).connection).toBe("reauthentication-required");

    const run = await runSync(ID, "full");
    expect(run.status).toBe("failed");
    expect(run.errors[0].message).toMatch(/consent/i);
  });
});

describe("Initial Sync", () => {
  beforeEach(() => useConnector());

  it("imports every mock transaction across all discovered accounts", async () => {
    await getConnector(ID)!.authenticate();
    const run = await runSync(ID, "full");

    expect(run.status).toBe("completed");
    expect(run.transactionsImported).toBe(11); // 4 savings + 3 checking + 2 credit-card + 2 wallet
    expect(run.errors).toHaveLength(0);
    expect(getSyncHistory(ID)).toHaveLength(1);
  });
});

describe("Duplicate Transactions", () => {
  beforeEach(() => useConnector());

  it("ignores every transaction on a second identical full sync", async () => {
    await getConnector(ID)!.authenticate();
    await runSync(ID, "full");
    const second = await runSync(ID, "full");

    expect(second.status).toBe("completed");
    expect(second.transactionsImported).toBe(0);
    expect(second.duplicatesIgnored).toBe(11);
  });
});

describe("Incremental Sync", () => {
  beforeEach(() => useConnector());

  it("processes only the incremental subset and detects the aa-txn-103 conflict", async () => {
    await getConnector(ID)!.authenticate();
    await runSync(ID, "full");
    const incremental = await runSync(ID, "incremental");

    expect(incremental.transactionsImported).toBe(0);
    expect(incremental.transactionsUpdated).toBe(1);
    expect(incremental.duplicatesIgnored).toBe(3);
    expect(incremental.warnings.some((w) => w.includes("aa-txn-103"))).toBe(true);
  });
});

describe("Failed Sync", () => {
  beforeEach(() => useConnector({ failSync: true }));

  it("records a failed SyncRun rather than throwing out of runSync", async () => {
    await getConnector(ID)!.authenticate();
    const run = await runSync(ID, "full");

    expect(run.status).toBe("failed");
    expect(run.errors[0].message).toMatch(/simulated upstream outage/i);
    expect(run.transactionsImported).toBe(0);
  });
});

describe("Provider Offline", () => {
  beforeEach(() => useConnector({ providerOffline: true }));

  it("rejects authenticate() and reports error health", async () => {
    await expect(getConnector(ID)!.authenticate()).rejects.toThrow(/offline/i);
    expect((await getConnector(ID)!.health()).status).toBe("error");
  });
});

describe("Account Removed", () => {
  beforeEach(() => useConnector({ removeAccountId: "aa-wallet-01" }));

  it("discovers one fewer account and omits its transactions from sync", async () => {
    await getConnector(ID)!.authenticate();
    const run = await runSync(ID, "full");
    expect(run.transactionsImported).toBe(9); // 11 - 2 wallet transactions
  });
});

describe("Disconnect", () => {
  beforeEach(() => useConnector());

  it("revokes consent and returns the connector to disconnected", async () => {
    await getConnector(ID)!.authenticate();
    await getConnector(ID)!.disconnect();

    expect((await getConnector(ID)!.status()).connection).toBe("disconnected");
    expect(getConsent()?.status).toBe("Revoked");
  });
});
