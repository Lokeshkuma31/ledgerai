import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "@/lib/banks/providers";
import { createDemoBankB } from "@/lib/banks/providers";
import { getConnector, registerConnector, setConnectorEnabled, unregisterConnector } from "@/lib/banks/registry";
import { getSyncHistory, retryFailedSync, runSync } from "@/lib/banks/sync-engine";

const BANK_A = "demo-bank-a";
const BANK_B = "demo-bank-b";

function resetBankA() {
  localStorage.clear();
  setConnectorEnabled(BANK_A, true);
}

describe("Authentication Flow", () => {
  beforeEach(resetBankA);

  it("reports disconnected and rejects sync() before authenticate() is called", async () => {
    const connector = getConnector(BANK_A)!;
    expect((await connector.status()).connection).toBe("disconnected");
    await expect(connector.sync("full")).rejects.toThrow(/not authenticated/i);
  });

  it("reports connected and healthy after authenticate()", async () => {
    const connector = getConnector(BANK_A)!;
    await connector.authenticate();
    expect((await connector.status()).connection).toBe("connected");
    expect((await connector.health()).status).toBe("healthy");
  });

  it("returns to disconnected after disconnect()", async () => {
    const connector = getConnector(BANK_A)!;
    await connector.authenticate();
    await connector.disconnect();
    expect((await connector.status()).connection).toBe("disconnected");
  });
});

describe("Sync Success", () => {
  beforeEach(resetBankA);

  it("imports every transaction from a full sync and records accounts + history", async () => {
    await getConnector(BANK_A)!.authenticate();
    const run = await runSync(BANK_A, "full");

    expect(run.status).toBe("completed");
    expect(run.transactionsImported).toBe(10);
    expect(run.transactionsUpdated).toBe(0);
    expect(run.duplicatesIgnored).toBe(0);
    expect(run.errors).toHaveLength(0);
    expect(run.completedAt).not.toBeNull();
    expect(run.durationMs).not.toBeNull();

    expect(getSyncHistory(BANK_A)).toHaveLength(1);
    expect(getSyncHistory(BANK_A)[0].status).toBe("completed");
  });
});

describe("Duplicate Transactions", () => {
  beforeEach(resetBankA);

  it("ignores every transaction on a second identical full sync", async () => {
    await getConnector(BANK_A)!.authenticate();
    await runSync(BANK_A, "full");
    const second = await runSync(BANK_A, "full");

    expect(second.status).toBe("completed");
    expect(second.transactionsImported).toBe(0);
    expect(second.transactionsUpdated).toBe(0);
    expect(second.duplicatesIgnored).toBe(10);
  });
});

describe("Incremental Sync", () => {
  beforeEach(resetBankA);

  it("only processes the connector's incremental subset, not the full feed", async () => {
    await getConnector(BANK_A)!.authenticate();
    await runSync(BANK_A, "full");
    const incremental = await runSync(BANK_A, "incremental");

    // Demo Bank A's incremental feed is 5 items: 4 unchanged + 1 conflict.
    expect(incremental.transactionsImported + incremental.transactionsUpdated + incremental.duplicatesIgnored).toBe(5);
    expect(incremental.transactionsImported).toBe(0); // nothing genuinely new
  });
});

describe("Conflict Resolution", () => {
  beforeEach(resetBankA);

  it("detects a changed transaction (pending -> posted, corrected amount) as an update, not a duplicate", async () => {
    await getConnector(BANK_A)!.authenticate();
    await runSync(BANK_A, "full");
    const incremental = await runSync(BANK_A, "incremental");

    expect(incremental.transactionsUpdated).toBe(1);
    expect(incremental.duplicatesIgnored).toBe(4);
    expect(incremental.warnings.some((w) => w.includes("txn-a-006"))).toBe(true);
    expect(incremental.warnings[0]).toMatch(/conflict resolved/i);
  });
});

describe("Disabled Connector", () => {
  beforeEach(resetBankA);

  it("rejects a sync attempt on a disabled connector without creating a running SyncRun", async () => {
    setConnectorEnabled(BANK_A, false);
    await expect(runSync(BANK_A, "manual")).rejects.toThrow(/disabled/i);
    expect(getSyncHistory(BANK_A)).toHaveLength(0);
  });
});

describe("Sync Failure", () => {
  beforeEach(() => {
    localStorage.clear();
    unregisterConnector(BANK_B);
    registerConnector(createDemoBankB({ failSync: true }));
    setConnectorEnabled(BANK_B, true);
  });
  afterEach(() => {
    unregisterConnector(BANK_B);
    registerConnector(createDemoBankB());
    setConnectorEnabled(BANK_B, true);
  });

  it("records a failed SyncRun (not a thrown exception) when the connector's sync() rejects", async () => {
    await getConnector(BANK_B)!.authenticate();
    const run = await runSync(BANK_B, "full");

    expect(run.status).toBe("failed");
    expect(run.errors).toHaveLength(1);
    expect(run.errors[0].message).toMatch(/simulated upstream outage/i);
    expect(run.transactionsImported).toBe(0);
  });

  it("can be retried once the connector recovers", async () => {
    await getConnector(BANK_B)!.authenticate();
    await runSync(BANK_B, "full");

    // Simulate recovery by swapping in a healthy instance under the same id.
    unregisterConnector(BANK_B);
    registerConnector(createDemoBankB());
    setConnectorEnabled(BANK_B, true);
    await getConnector(BANK_B)!.authenticate();

    const retried = await retryFailedSync(BANK_B);
    expect(retried?.status).toBe("completed");
  });
});

describe("retryFailedSync", () => {
  beforeEach(resetBankA);

  it("returns undefined when there's nothing to retry", async () => {
    await getConnector(BANK_A)!.authenticate();
    await runSync(BANK_A, "full");
    expect(await retryFailedSync(BANK_A)).toBeUndefined();
  });
});
