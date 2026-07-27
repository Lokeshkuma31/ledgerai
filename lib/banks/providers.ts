/**
 * Mock Bank Connectors — Demo Bank A, Demo Bank B, Demo Credit Card, and
 * Demo Wallet. These are the framework's reference implementation: proof
 * that a real connector can be built against connector.ts's interface
 * alone, and the fixtures this milestone's tests exercise. No real bank
 * API, network call, or credential is ever involved — see this file's
 * README section in lib/banks (there isn't one; see the milestone's
 * "Do NOT Add" list) for what a future real connector would replace.
 */
import { registerConnector } from "@/lib/banks/registry";
// Side-effect import: sync-engine.ts registers the framework's Feed/
// Search/Coach contributors as a module-level side effect. Anything that
// registers connectors needs those contributors live too — a connector
// nobody can query the Feed/Coach/Index about isn't useful — so this file
// (the one thing every consumer already imports to get connectors at
// all) is the single choke point that guarantees both happen together.
import "@/lib/banks/sync-engine";
import type { BankConnector, BankSyncFetchResult } from "@/lib/banks/connector";
import type {
  BankAccount,
  BankAccountType,
  BankFeature,
  ConnectionStatus,
  ConnectorHealth,
  ConnectorMetadata,
  ConnectorStatusSnapshot,
  RawBankTransaction,
  SyncType,
} from "@/lib/banks/types";

function tx(
  externalId: string,
  accountId: string,
  amount: number,
  direction: "debit" | "credit",
  description: string,
  postedAt: string,
  extra: Partial<RawBankTransaction> = {},
): RawBankTransaction {
  return {
    externalId,
    accountId,
    amount,
    direction,
    currency: "INR",
    description,
    postedAt,
    pending: false,
    ...extra,
  };
}

/** Shared scaffolding every mock connector needs (connection lifecycle,
 * enforcing authenticate()-before-sync()) — not part of the published
 * BankConnector contract, just an implementation convenience so the four
 * connectors below aren't four copies of the same boilerplate. A real
 * connector is free to structure this however it wants; nothing in
 * lib/banks/ depends on this class existing. */
abstract class MockConnectorBase implements BankConnector {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly country: string;
  abstract readonly institution: string;
  readonly version = "1.0.0";

  protected connection: ConnectionStatus = "disconnected";
  protected connectionMessage = "Not yet connected.";

  abstract supportedAccounts(): BankAccountType[];
  abstract supportedFeatures(): BankFeature[];
  protected abstract fetchAccounts(): BankAccount[];
  protected abstract fetchTransactions(syncType: SyncType): RawBankTransaction[];

  async authenticate(): Promise<void> {
    this.connection = "connected";
    this.connectionMessage = "Connected.";
  }

  async disconnect(): Promise<void> {
    this.connection = "disconnected";
    this.connectionMessage = "Disconnected by user.";
  }

  async refresh(): Promise<void> {
    if (this.connection === "disconnected") {
      throw new Error(`${this.institution}: cannot refresh — not connected.`);
    }
  }

  async sync(syncType: SyncType): Promise<BankSyncFetchResult> {
    if (this.connection !== "connected") {
      throw new Error(`${this.institution}: not authenticated. Call authenticate() before syncing.`);
    }
    return { accounts: this.fetchAccounts(), transactions: this.fetchTransactions(syncType) };
  }

  async health(): Promise<ConnectorHealth> {
    const checkedAt = new Date().toISOString();
    if (this.connection === "connected") {
      return { status: "healthy", message: "Connected.", checkedAt };
    }
    if (this.connection === "error" || this.connection === "reauthentication-required") {
      return { status: "authentication-required", message: this.connectionMessage, checkedAt };
    }
    return { status: "disconnected", message: this.connectionMessage, checkedAt };
  }

  async status(): Promise<ConnectorStatusSnapshot> {
    return { connection: this.connection, message: this.connectionMessage, updatedAt: new Date().toISOString() };
  }

  metadata(): ConnectorMetadata {
    return { description: `Mock connector for ${this.institution} — demo data only.` };
  }
}

// --- Demo Bank A: a full-service retail bank (checking + savings) ---------

class DemoBankAConnector extends MockConnectorBase {
  readonly id = "demo-bank-a";
  readonly name = "Demo Bank A";
  readonly country = "IN";
  readonly institution = "Demo Bank A";

  supportedAccounts(): BankAccountType[] {
    return ["checking", "savings"];
  }
  supportedFeatures(): BankFeature[] {
    return ["transaction-sync", "balance-sync", "account-metadata", "recurring-payments", "statements"];
  }

  protected fetchAccounts(): BankAccount[] {
    const now = new Date().toISOString();
    return [
      {
        id: "demo-bank-a:checking",
        institution: this.institution,
        accountName: "Everyday Checking",
        accountType: "checking",
        maskedNumber: "XXXX4321",
        currency: "INR",
        balance: 84250.5,
        availableBalance: 84250.5,
        lastSynced: now,
        status: "active",
        metadata: {},
      },
      {
        id: "demo-bank-a:savings",
        institution: this.institution,
        accountName: "High-Yield Savings",
        accountType: "savings",
        maskedNumber: "XXXX9087",
        currency: "INR",
        balance: 210300,
        availableBalance: 210300,
        lastSynced: now,
        status: "active",
        metadata: {},
      },
    ];
  }

  protected fetchTransactions(syncType: SyncType): RawBankTransaction[] {
    const checking = "demo-bank-a:checking";
    const savings = "demo-bank-a:savings";
    const full: RawBankTransaction[] = [
      tx("txn-a-001", checking, 55000, "credit", "Salary", "2026-07-01"),
      tx("txn-a-002", checking, 1850, "debit", "BESCOM electricity bill", "2026-07-05"),
      tx("txn-a-003", checking, 25000, "debit", "Rent payment", "2026-07-02"),
      tx("txn-a-004", checking, 2200, "debit", "Payment at Big Bazaar", "2026-07-08"),
      tx("txn-a-005", savings, 850, "credit", "Interest credit", "2026-07-10"),
      // This one's fingerprint deliberately changes between full and
      // incremental sync below (pending -> posted, amount corrected) —
      // exercises the sync engine's conflict-detection path.
      tx("txn-a-006", checking, 499, "debit", "Payment at Swiggy", "2026-07-15", { pending: true }),
      tx("txn-a-007", checking, 3200, "debit", "Payment at Amazon", "2026-07-18"),
      tx("txn-a-008", checking, 1200, "debit", "Netflix subscription", "2026-07-20"),
      tx("txn-a-009", checking, 5000, "debit", "Transfer to Priya Singh", "2026-07-22"),
      tx("txn-a-010", checking, 499, "credit", "Refund from Flipkart", "2026-07-24"),
    ];

    if (syncType !== "incremental") return full;

    // Incremental: the tail of the same feed, plus txn-a-006 with its
    // pending charge now posted at a corrected amount.
    return [
      tx("txn-a-006", checking, 512.5, "debit", "Payment at Swiggy", "2026-07-15", { pending: false }),
      full[6],
      full[7],
      full[8],
      full[9],
    ];
  }
}

// --- Demo Bank B: a second retail bank, for multi-institution scenarios ---

class DemoBankBConnector extends MockConnectorBase {
  readonly id = "demo-bank-b";
  readonly name = "Demo Bank B";
  readonly country = "US";
  readonly institution = "Demo Bank B";

  /** Testing hooks only — no real connector would expose these; they let
   * tests exercise "Sync Failure" and "Authentication Flow" failure paths
   * without needing a second class. */
  constructor(private readonly options: { failAuthenticate?: boolean; failSync?: boolean } = {}) {
    super();
  }

  async authenticate(): Promise<void> {
    if (this.options.failAuthenticate) {
      this.connection = "error";
      this.connectionMessage = "Simulated authentication failure.";
      throw new Error("Demo Bank B: authentication failed (simulated).");
    }
    return super.authenticate();
  }

  async sync(syncType: SyncType): Promise<BankSyncFetchResult> {
    if (this.options.failSync) {
      throw new Error("Demo Bank B: sync failed (simulated upstream outage).");
    }
    return super.sync(syncType);
  }

  supportedAccounts(): BankAccountType[] {
    return ["checking"];
  }
  supportedFeatures(): BankFeature[] {
    return ["transaction-sync", "balance-sync", "account-metadata", "standing-instructions"];
  }

  protected fetchAccounts(): BankAccount[] {
    return [
      {
        id: "demo-bank-b:checking",
        institution: this.institution,
        accountName: "Free Checking",
        accountType: "checking",
        maskedNumber: "XXXX7712",
        currency: "USD",
        balance: 5320.4,
        availableBalance: 5200,
        lastSynced: new Date().toISOString(),
        status: "active",
        metadata: {},
      },
    ];
  }

  protected fetchTransactions(syncType: SyncType): RawBankTransaction[] {
    const accountId = "demo-bank-b:checking";
    const full: RawBankTransaction[] = [
      tx("txn-b-001", accountId, 3200, "credit", "Paycheck", "2026-07-01", { currency: "USD" }),
      tx("txn-b-002", accountId, 4.5, "debit", "Payment at Starbucks", "2026-07-03", { currency: "USD" }),
      tx("txn-b-003", accountId, 86.2, "debit", "Payment at Whole Foods", "2026-07-06", { currency: "USD" }),
      tx("txn-b-004", accountId, 1400, "debit", "Rent payment", "2026-07-02", { currency: "USD" }),
      tx("txn-b-005", accountId, 45, "debit", "Gym membership", "2026-07-10", { currency: "USD" }),
      tx("txn-b-006", accountId, 22, "debit", "Payment at Uber", "2026-07-14", { currency: "USD" }),
      tx("txn-b-007", accountId, 60, "debit", "Phone bill", "2026-07-17", { currency: "USD" }),
      tx("txn-b-008", accountId, 15.75, "credit", "Dividend payout", "2026-07-20", { currency: "USD" }),
    ];
    return syncType === "incremental" ? full.slice(-3) : full;
  }
}

// --- Demo Credit Card ------------------------------------------------------

class DemoCreditCardConnector extends MockConnectorBase {
  readonly id = "demo-credit-card";
  readonly name = "Demo Credit Card";
  readonly country = "IN";
  readonly institution = "Demo Credit Card Co.";

  supportedAccounts(): BankAccountType[] {
    return ["credit-card"];
  }
  supportedFeatures(): BankFeature[] {
    return ["transaction-sync", "balance-sync", "credit-cards", "statements"];
  }

  protected fetchAccounts(): BankAccount[] {
    return [
      {
        id: "demo-credit-card:card1",
        institution: this.institution,
        accountName: "Rewards Credit Card",
        accountType: "credit-card",
        maskedNumber: "XXXX5566",
        currency: "INR",
        balance: -18400,
        availableBalance: 81600,
        lastSynced: new Date().toISOString(),
        status: "active",
        metadata: { creditLimit: 100000 },
      },
    ];
  }

  protected fetchTransactions(syncType: SyncType): RawBankTransaction[] {
    const accountId = "demo-credit-card:card1";
    const full: RawBankTransaction[] = [
      tx("txn-cc-001", accountId, 3499, "debit", "Payment at Myntra", "2026-07-04"),
      tx("txn-cc-002", accountId, 1200, "debit", "Payment at Dominos", "2026-07-09"),
      tx("txn-cc-003", accountId, 4500, "debit", "Fuel purchase", "2026-07-12"),
      tx("txn-cc-004", accountId, 500, "debit", "Annual fee", "2026-07-01"),
      tx("txn-cc-005", accountId, 350, "credit", "Cashback", "2026-07-16"),
      tx("txn-cc-006", accountId, 8850, "debit", "Payment at MakeMyTrip", "2026-07-19"),
    ];
    return syncType === "incremental" ? full.slice(-2) : full;
  }
}

// --- Demo Wallet -------------------------------------------------------------

class DemoWalletConnector extends MockConnectorBase {
  readonly id = "demo-wallet";
  readonly name = "Demo Wallet";
  readonly country = "IN";
  readonly institution = "Demo Wallet";

  supportedAccounts(): BankAccountType[] {
    return ["wallet"];
  }
  supportedFeatures(): BankFeature[] {
    return ["transaction-sync", "balance-sync", "account-metadata"];
  }

  protected fetchAccounts(): BankAccount[] {
    return [
      {
        id: "demo-wallet:main",
        institution: this.institution,
        accountName: "Demo Wallet",
        accountType: "wallet",
        maskedNumber: "XXXX0099",
        currency: "INR",
        balance: 1450,
        availableBalance: 1450,
        lastSynced: new Date().toISOString(),
        status: "active",
        metadata: {},
      },
    ];
  }

  protected fetchTransactions(syncType: SyncType): RawBankTransaction[] {
    const accountId = "demo-wallet:main";
    const full: RawBankTransaction[] = [
      tx("txn-w-001", accountId, 2000, "credit", "Wallet top-up", "2026-07-05"),
      tx("txn-w-002", accountId, 120, "debit", "Payment at Chai Point", "2026-07-11"),
      tx("txn-w-003", accountId, 40, "debit", "Payment at Parking Fee", "2026-07-13"),
      tx("txn-w-004", accountId, 60, "debit", "Payment at Metro Card Recharge", "2026-07-18"),
      tx("txn-w-005", accountId, 90, "credit", "Cashback", "2026-07-21"),
    ];
    return syncType === "incremental" ? full.slice(-2) : full;
  }
}

export function createDemoBankA(): BankConnector {
  return new DemoBankAConnector();
}
export function createDemoBankB(options?: { failAuthenticate?: boolean; failSync?: boolean }): BankConnector {
  return new DemoBankBConnector(options);
}
export function createDemoCreditCard(): BankConnector {
  return new DemoCreditCardConnector();
}
export function createDemoWallet(): BankConnector {
  return new DemoWalletConnector();
}

/**
 * The actual singleton instances the app registers — a connector holds
 * mutable connection state, so the app needs to keep talking to the same
 * object it registered, not a freshly constructed one each time. Tests
 * that need an isolated (e.g. failure-injected) connector should use the
 * create*() factories above instead of these.
 */
const demoBankA = createDemoBankA();
const demoBankB = createDemoBankB();
const demoCreditCard = createDemoCreditCard();
const demoWallet = createDemoWallet();

/** The framework's own "no dynamic loading" built-in list, the same
 * pattern lib/plugins/loader.ts's builtInPlugins() uses. */
export function getAllDemoConnectors(): BankConnector[] {
  return [demoBankA, demoBankB, demoCreditCard, demoWallet];
}

for (const connector of getAllDemoConnectors()) {
  registerConnector(connector);
}
