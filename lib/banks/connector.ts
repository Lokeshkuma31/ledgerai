/**
 * The Bank Connector contract — every bank, card, or wallet integration
 * (real or mock) implements exactly this interface. sync-engine.ts,
 * registry.ts, health.ts, and scheduler.ts only ever talk to a connector
 * through these methods; none of them import a specific connector's own
 * module, so a connector is a drop-in the rest of the framework never has
 * to change for.
 */
import type {
  BankAccount,
  BankAccountType,
  BankFeature,
  ConnectorHealth,
  ConnectorMetadata,
  ConnectorStatusSnapshot,
  RawBankTransaction,
  SyncType,
} from "@/lib/banks/types";

/**
 * What sync() hands back — already translated into the framework's
 * bank-agnostic shapes (BankAccount / RawBankTransaction). A connector's
 * own bank-specific request/response schema must never leak past this
 * boundary; mapper.ts only ever sees RawBankTransaction, never a bank's
 * own API payload.
 */
export interface BankSyncFetchResult {
  accounts: BankAccount[];
  transactions: RawBankTransaction[];
}

export interface BankConnector {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly institution: string;
  readonly version: string;

  /** Which BankAccountTypes this connector is capable of returning at all
   * (not which accounts a particular user happens to have connected). */
  supportedAccounts(): BankAccountType[];
  /** Which BankFeatures this connector implements. */
  supportedFeatures(): BankFeature[];

  /** Establishes a connection. In this milestone every connector is a
   * mock with no real credential flow — see providers.ts — but the
   * signature is what a real OAuth/Account-Aggregator/Open-Banking flow
   * would implement against unchanged. */
  authenticate(): Promise<void>;
  /** Tears down the connection; the connector should report
   * status().connection === "disconnected" afterward. */
  disconnect(): Promise<void>;
  /** Refreshes an existing session/token without a full re-authentication
   * (e.g. a near-expired access token) — a no-op for connectors that don't
   * need it. */
  refresh(): Promise<void>;
  /** Fetches accounts + transactions for the given sync type. Must never
   * throw for an expected condition (e.g. no new transactions) — that's a
   * successful sync with zero results, not a failure. Only throw for a
   * genuine fetch failure; sync-engine.ts records that as a failed run. */
  sync(syncType: SyncType): Promise<BankSyncFetchResult>;

  health(): Promise<ConnectorHealth>;
  status(): Promise<ConnectorStatusSnapshot>;
  metadata(): ConnectorMetadata;
}
