/**
 * Connector Registry — holds every installed connector's live instance
 * plus its persisted enabled/health/connection/lastSync state, and every
 * connector's most recently synced accounts. Deliberately independent of
 * React, storage, and any specific connector implementation: it only
 * knows the BankConnector shape (connector.ts) and the framework's own
 * types (types.ts).
 */
import type { BankConnector } from "@/lib/banks/connector";
import type {
  AccountStatus,
  BankAccount,
  ConnectionStatus,
  ConnectorHealth,
  ConnectorRecord,
} from "@/lib/banks/types";

const STATE_KEY = "ledgerai:banks:state";
const ACCOUNTS_KEY = "ledgerai:banks:accounts";

interface PersistedConnectorState {
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
  lastHealth?: ConnectorHealth;
  lastConnection?: ConnectionStatus;
  lastSync?: string | null;
}
type PersistedStateMap = Record<string, PersistedConnectorState>;
type AccountsMap = Record<string, BankAccount[]>;

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || typeof parsed !== "object" ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readState(): PersistedStateMap {
  return readJSON(STATE_KEY, {});
}
function writeState(state: PersistedStateMap): void {
  writeJSON(STATE_KEY, state);
}

function readAccounts(): AccountsMap {
  return readJSON(ACCOUNTS_KEY, {});
}
function writeAccounts(accounts: AccountsMap): void {
  writeJSON(ACCOUNTS_KEY, accounts);
}

/** In-memory instance registry — every actually-registered BankConnector
 * with its live methods. Not persisted: functions aren't serializable,
 * and providers.ts (or a future real connector module) repopulates this
 * from the same static list every session, exactly like
 * lib/plugins/registry.ts's instance map. */
const instances = new Map<string, BankConnector>();

export function registerConnector(connector: BankConnector): void {
  if (instances.has(connector.id)) {
    throw new Error(`Connector "${connector.id}" is already registered.`);
  }
  instances.set(connector.id, connector);

  const state = readState();
  if (!state[connector.id]) {
    const now = new Date().toISOString();
    state[connector.id] = { enabled: true, installedAt: now, updatedAt: now };
    writeState(state);
  }
}

export function unregisterConnector(id: string): void {
  instances.delete(id);
  const accounts = readAccounts();
  if (id in accounts) {
    delete accounts[id];
    writeAccounts(accounts);
  }
}

export function getConnector(id: string): BankConnector | undefined {
  return instances.get(id);
}

export function getAllConnectors(): BankConnector[] {
  return Array.from(instances.values());
}

export function isConnectorEnabled(id: string): boolean {
  return readState()[id]?.enabled ?? false;
}

export function getEnabledConnectors(): BankConnector[] {
  return getAllConnectors().filter((c) => isConnectorEnabled(c.id));
}

export function setConnectorEnabled(id: string, enabled: boolean): void {
  if (!instances.has(id)) throw new Error(`Cannot toggle unknown connector "${id}".`);
  const state = readState();
  const now = new Date().toISOString();
  const existing = state[id] ?? { enabled, installedAt: now, updatedAt: now };
  state[id] = { ...existing, enabled, updatedAt: now };
  writeState(state);
}

export function recordConnectorHealth(id: string, health: ConnectorHealth): void {
  const state = readState();
  const now = new Date().toISOString();
  const existing = state[id] ?? { enabled: instances.get(id)?.id === id, installedAt: now, updatedAt: now };
  state[id] = { ...existing, lastHealth: health, updatedAt: now };
  writeState(state);
}

export function recordConnectorConnection(id: string, connection: ConnectionStatus): void {
  const state = readState();
  const now = new Date().toISOString();
  const existing = state[id] ?? { enabled: true, installedAt: now, updatedAt: now };
  state[id] = { ...existing, lastConnection: connection, updatedAt: now };
  writeState(state);
}

export function recordConnectorLastSync(id: string, lastSyncIso: string): void {
  const state = readState();
  const now = new Date().toISOString();
  const existing = state[id] ?? { enabled: true, installedAt: now, updatedAt: now };
  state[id] = { ...existing, lastSync: lastSyncIso, updatedAt: now };
  writeState(state);
}

/** Replaces this connector's stored accounts wholesale with its latest
 * sync result — a connector's own sync() is always the full authoritative
 * account list it currently knows about, so there's nothing to merge. */
export function upsertAccounts(connectorId: string, accounts: BankAccount[]): void {
  const map = readAccounts();
  map[connectorId] = accounts;
  writeAccounts(map);
}

export function getAccountsForConnector(connectorId: string): BankAccount[] {
  return readAccounts()[connectorId] ?? [];
}

export function getAllAccounts(): BankAccount[] {
  return Object.values(readAccounts()).flat();
}

/** Marks every account of a connector "error" without discarding its last
 * known balances — used when a connector's health turns bad, so the
 * dashboard can show *why* an account looks stale rather than silently
 * dropping it. */
export function markAccountsStatus(connectorId: string, status: AccountStatus): void {
  const map = readAccounts();
  const accounts = map[connectorId];
  if (!accounts) return;
  map[connectorId] = accounts.map((a) => ({ ...a, status }));
  writeAccounts(map);
}

/** A read-only snapshot combining live instance data with persisted
 * metadata — everything the /banks dashboard and Connector Registry spec
 * section need in one JSON-safe record per connector. */
export function getAllConnectorRecords(): ConnectorRecord[] {
  const state = readState();
  const now = new Date().toISOString();
  return getAllConnectors().map((connector) => {
    const persisted = state[connector.id];
    return {
      id: connector.id,
      name: connector.name,
      institution: connector.institution,
      country: connector.country,
      version: connector.version,
      enabled: persisted?.enabled ?? false,
      connection: persisted?.lastConnection ?? "disconnected",
      health: persisted?.lastHealth ?? { status: "disconnected", message: "Not yet checked.", checkedAt: now },
      lastSync: persisted?.lastSync ?? null,
      supportedAccounts: connector.supportedAccounts(),
      supportedFeatures: connector.supportedFeatures(),
      metadata: connector.metadata(),
      installedAt: persisted?.installedAt ?? now,
      updatedAt: persisted?.updatedAt ?? now,
    };
  });
}

export function getConnectorRecord(id: string): ConnectorRecord | undefined {
  return getAllConnectorRecords().find((r) => r.id === id);
}

export function clearConnectorState(): void {
  writeState({});
  writeAccounts({});
}
