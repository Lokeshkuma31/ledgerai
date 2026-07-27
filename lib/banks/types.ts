/**
 * Shared types for the Bank Connector Framework. Every other file in
 * lib/banks/ depends only on this file (plus, where noted, connector.ts) —
 * it never depends on them, so this stays the framework's single source
 * of truth for its data shapes.
 */

/** Every kind of account a connector can report. Adding a new account
 * type later is a new value here — nothing else needs to change until a
 * connector actually starts reporting one. */
export const BANK_ACCOUNT_TYPES = [
  "checking",
  "savings",
  "credit-card",
  "loan",
  "investment",
  "wallet",
  "business",
  "cash",
] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

/** Every capability a connector can advertise via supportedFeatures().
 * Deliberately separate from BANK_ACCOUNT_TYPES: a connector can support
 * the "checking"/"savings" account types while also advertising the
 * "credit-cards" *feature* once it later adds a credit-card account, and
 * features like "statements" or "standing-instructions" aren't account
 * types at all. */
export const BANK_FEATURES = [
  "transaction-sync",
  "balance-sync",
  "account-metadata",
  "credit-cards",
  "loans",
  "investments",
  "recurring-payments",
  "standing-instructions",
  "statements",
] as const;
export type BankFeature = (typeof BANK_FEATURES)[number];

export const CONNECTOR_HEALTH_STATUSES = [
  "healthy",
  "syncing",
  "warning",
  "disconnected",
  "authentication-required",
  "error",
  "disabled",
] as const;
export type ConnectorHealthStatus = (typeof CONNECTOR_HEALTH_STATUSES)[number];

export interface ConnectorHealth {
  status: ConnectorHealthStatus;
  message: string;
  checkedAt: string; // ISO 8601
}

/** The connector's own view of its connection lifecycle — distinct from
 * ConnectorHealth, which also factors in enabled/disabled state and
 * recent sync outcomes (see health.ts). */
export const CONNECTION_STATUSES = [
  "connected",
  "disconnected",
  "authenticating",
  "reauthentication-required",
  "error",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export interface ConnectorStatusSnapshot {
  connection: ConnectionStatus;
  message?: string;
  updatedAt: string; // ISO 8601
}

export const ACCOUNT_STATUSES = ["active", "inactive", "closed", "error"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** One account as reported by a connector — the Account Model every
 * connector must produce, regardless of what its own bank API calls
 * things internally. */
export interface BankAccount {
  id: string;
  institution: string;
  accountName: string;
  accountType: BankAccountType;
  maskedNumber: string;
  currency: string;
  balance: number;
  availableBalance: number;
  lastSynced: string | null; // ISO 8601
  status: AccountStatus;
  metadata: Record<string, unknown>;
}

export const SYNC_TYPES = ["full", "incremental", "manual", "scheduled"] as const;
export type SyncType = (typeof SYNC_TYPES)[number];

export const SYNC_RUN_STATUSES = ["running", "completed", "failed", "partial"] as const;
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number];

/**
 * A bank-agnostic transaction as handed from a connector to the mapper.
 * Every connector's job is translating its own bank-specific API/webhook
 * schema into exactly this shape — nothing outside a connector's own
 * implementation file ever sees a bank-specific field.
 */
export interface RawBankTransaction {
  /** The bank's own stable transaction identifier — the strongest
   * duplicate-detection signal there is, since (unlike an SMS) a bank API
   * always assigns one. */
  externalId: string;
  accountId: string;
  amount: number; // always positive; direction carries the sign
  direction: "debit" | "credit";
  currency: string;
  description: string;
  postedAt: string; // "YYYY-MM-DD"
  category?: string; // bank-provided category hint, if any
  merchantName?: string;
  pending: boolean;
}

export interface SyncError {
  message: string;
  accountId?: string;
}

/** One full execution record — what sync-engine.ts persists as Sync
 * History. Mirrors lib/workflows/history.ts's WorkflowRun in spirit: a
 * complete, traceable record of one sync attempt. */
export interface SyncRun {
  id: string;
  connectorId: string;
  syncType: SyncType;
  status: SyncRunStatus;
  startedAt: string; // ISO 8601
  completedAt: string | null; // ISO 8601
  durationMs: number | null;
  transactionsImported: number;
  transactionsUpdated: number;
  duplicatesIgnored: number;
  errors: SyncError[];
  warnings: string[];
  connectorVersion: string;
}

export interface ConnectorMetadata {
  description: string;
  logoUrl?: string;
  websiteUrl?: string;
  supportEmail?: string;
}

/**
 * A read-only, JSON-serializable snapshot of one connector — combines the
 * live instance's static fields with persisted enabled/health/connection/
 * lastSync state, the same split lib/plugins/registry.ts's PluginRecord
 * uses for Plugin instances (connector objects have methods, so they
 * aren't serializable themselves).
 */
export interface ConnectorRecord {
  id: string;
  name: string;
  institution: string;
  country: string;
  version: string;
  enabled: boolean;
  connection: ConnectionStatus;
  health: ConnectorHealth;
  lastSync: string | null; // ISO 8601
  supportedAccounts: BankAccountType[];
  supportedFeatures: BankFeature[];
  metadata: ConnectorMetadata;
  installedAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface SyncScheduleConfig {
  enabled: boolean;
  intervalMinutes: number;
}
