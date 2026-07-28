/**
 * Account Aggregator Connector — the BankConnector implementation the
 * Bank Sync Engine and /banks dashboard drive like any other connector.
 * Delegates every AA-specific concern to its own module: auth.ts (consent
 * flow), consent.ts (state), mock-provider.ts (fixture data), mapper.ts
 * (shape translation) — this file only composes them against the
 * published BankConnector contract.
 */
import { registerConnector } from "@/lib/banks/registry";
// Side-effect import: sync-engine.ts registers the framework's own Feed/
// Search/Coach contributors as a module-level side effect — the same
// choke-point pattern lib/banks/providers.ts uses, so anything that
// registers a connector also gets those contributors live.
import "@/lib/banks/sync-engine";
import type { BankConnector, BankSyncFetchResult } from "@/lib/banks/connector";
import type {
  BankAccountType,
  BankFeature,
  ConnectorHealth,
  ConnectorMetadata,
  ConnectorStatusSnapshot,
  ConnectionStatus,
  SyncType,
} from "@/lib/banks/types";
import { runWorkflowsForTrigger } from "@/lib/workflows/engine";
import { connect, ConsentDeniedError, currentConsent, disconnectSession, ProviderOfflineError, refreshSession } from "@/plugins/account-aggregator/auth";
import { checkProviderHealth, discoverAccounts, fetchTransactions } from "@/plugins/account-aggregator/mock-provider";
import { toBankAccount, toRawBankTransaction } from "@/plugins/account-aggregator/mapper";
import type { AAScenarioOptions } from "@/plugins/account-aggregator/types";

export const ACCOUNT_AGGREGATOR_CONNECTOR_ID = "account-aggregator";

class AccountAggregatorConnector implements BankConnector {
  readonly id = ACCOUNT_AGGREGATOR_CONNECTOR_ID;
  readonly name = "Account Aggregator (Mock)";
  readonly country = "IN";
  readonly institution = "Account Aggregator Network";
  readonly version = "1.0.0";

  private connection: ConnectionStatus = "disconnected";
  private connectionMessage = "Not yet connected.";

  /** Test-only scenario toggles — see types.ts's AAScenarioOptions. A real
   * connector would have no equivalent constructor argument. */
  constructor(private readonly options: AAScenarioOptions = {}) {}

  supportedAccounts(): BankAccountType[] {
    return ["savings", "checking", "credit-card", "wallet"];
  }
  supportedFeatures(): BankFeature[] {
    return ["transaction-sync", "balance-sync", "account-metadata"];
  }

  async authenticate(): Promise<void> {
    try {
      const { consent } = await connect(this.options);
      if (consent.status !== "Granted") {
        this.connection = "reauthentication-required";
        this.connectionMessage = "Consent expired immediately after being granted (test scenario).";
        return;
      }
      this.connection = "connected";
      this.connectionMessage = "Connected.";
      const now = new Date();
      await runWorkflowsForTrigger("consent-granted", { consentId: consent.id, linkedAccounts: consent.linkedAccounts }, now);
      await runWorkflowsForTrigger("account-connected", { connectorId: this.id, accountCount: consent.linkedAccounts.length }, now);
    } catch (error) {
      this.connection = "error";
      this.connectionMessage = error instanceof Error ? error.message : "Authentication failed.";
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    disconnectSession();
    this.connection = "disconnected";
    this.connectionMessage = "Disconnected by user.";
    await runWorkflowsForTrigger("disconnect", { connectorId: this.id }, new Date());
  }

  async refresh(): Promise<void> {
    if (this.connection === "disconnected") {
      throw new Error("Account Aggregator: cannot refresh — not connected.");
    }
    const consent = refreshSession();
    if (!consent || consent.status !== "Granted") {
      this.connection = "reauthentication-required";
      this.connectionMessage = "Consent is no longer valid — reauthentication required.";
    }
  }

  async sync(syncType: SyncType): Promise<BankSyncFetchResult> {
    if (this.connection === "reauthentication-required") {
      throw new Error("Account Aggregator: consent is no longer valid — reauthenticate to continue syncing.");
    }
    if (this.connection !== "connected") {
      throw new Error("Account Aggregator: not authenticated. Call authenticate() before syncing.");
    }
    const consent = refreshSession();
    if (!consent || consent.status !== "Granted") {
      this.connection = "reauthentication-required";
      throw new Error("Account Aggregator: consent is no longer valid — reauthenticate to continue syncing.");
    }
    if (this.options.failSync) {
      throw new Error("Account Aggregator: sync failed (simulated upstream outage).");
    }

    const rawAccounts = discoverAccounts(this.options);
    const accounts = rawAccounts.map(toBankAccount);
    const transactions = rawAccounts.flatMap((a) => fetchTransactions(a.aaAccountId, syncType).map(toRawBankTransaction));
    return { accounts, transactions };
  }

  async health(): Promise<ConnectorHealth> {
    const checkedAt = new Date().toISOString();
    const providerHealth = checkProviderHealth(this.options);
    if (providerHealth.status === "offline") {
      return { status: "error", message: providerHealth.message, checkedAt };
    }

    const consent = currentConsent();
    if (this.connection === "connected" && consent?.status === "Granted") {
      return { status: "healthy", message: "Connected — consent active.", checkedAt };
    }
    if (this.connection === "reauthentication-required" || consent?.status === "Expired") {
      return { status: "authentication-required", message: "Consent expired — reauthentication required.", checkedAt };
    }
    if (consent?.status === "Denied") {
      return { status: "authentication-required", message: "Consent was denied.", checkedAt };
    }
    if (this.connection === "error") {
      return { status: "error", message: this.connectionMessage, checkedAt };
    }
    return { status: "disconnected", message: this.connectionMessage, checkedAt };
  }

  async status(): Promise<ConnectorStatusSnapshot> {
    return { connection: this.connection, message: this.connectionMessage, updatedAt: new Date().toISOString() };
  }

  metadata(): ConnectorMetadata {
    return {
      description: "Mock Account Aggregator connector — validates the connector lifecycle end-to-end via mock provider responses only.",
    };
  }
}

export function createAccountAggregatorConnector(options?: AAScenarioOptions): BankConnector {
  return new AccountAggregatorConnector(options);
}

/** The singleton instance the app registers — holds mutable connection
 * state, so the app must keep talking to this same object (see
 * lib/banks/providers.ts's identical singleton-vs-factory split). Tests
 * needing scenario injection (Denied/Offline/Failed sync) should use
 * createAccountAggregatorConnector() instead. */
const accountAggregatorConnector = createAccountAggregatorConnector();
registerConnector(accountAggregatorConnector);

export { ConsentDeniedError, ProviderOfflineError };
