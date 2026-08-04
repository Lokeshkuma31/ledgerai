/**
 * Bank Sync Service — combines lib/banks/registry.ts's in-memory live
 * connector instances (unchanged — functions aren't serializable, and
 * lib/banks/providers.ts re-registers them every cold start) with
 * repositories/bank-repository.ts's Postgres-backed persisted state, the
 * same split lib/connections/engine.ts already established for Connection
 * Hub. Mirrors lib/banks/registry.ts's public API, now organization-scoped
 * and async where persistence is involved.
 */
import { getAllConnectors, getConnector } from "@/lib/banks/registry";
import type { BankConnector } from "@/lib/banks/connector";
import type {
  AccountStatus,
  BankAccount,
  ConnectionStatus,
  ConnectorHealth,
  ConnectorRecord,
} from "@/lib/banks/types";
import * as bankRepository from "@/repositories/bank-repository";

export async function registerConnectorState(
  organizationId: string,
  connector: BankConnector,
): Promise<void> {
  await bankRepository.ensureConnectorRegistered(organizationId, connector.id);
}

export async function isConnectorEnabled(
  organizationId: string,
  id: string,
): Promise<boolean> {
  const state = await bankRepository.getState(organizationId, id);
  return state?.enabled ?? false;
}

export async function getEnabledConnectors(
  organizationId: string,
): Promise<BankConnector[]> {
  const states = await bankRepository.getAllStates(organizationId);
  return getAllConnectors().filter((connector) => states[connector.id]?.enabled);
}

export async function setConnectorEnabled(
  organizationId: string,
  id: string,
  enabled: boolean,
): Promise<void> {
  if (!getConnector(id)) throw new Error(`Cannot toggle unknown connector "${id}".`);
  await bankRepository.setConnectorEnabled(organizationId, id, enabled);
}

export async function recordConnectorHealth(
  organizationId: string,
  id: string,
  health: ConnectorHealth,
): Promise<void> {
  await bankRepository.recordConnectorHealth(organizationId, id, health);
}

export async function recordConnectorConnection(
  organizationId: string,
  id: string,
  connection: ConnectionStatus,
): Promise<void> {
  await bankRepository.recordConnectorConnection(organizationId, id, connection);
}

export async function recordConnectorLastSync(
  organizationId: string,
  id: string,
  lastSyncIso: string,
): Promise<void> {
  await bankRepository.recordConnectorLastSync(organizationId, id, lastSyncIso);
}

export async function upsertAccounts(
  organizationId: string,
  connectorId: string,
  accounts: BankAccount[],
): Promise<void> {
  return bankRepository.upsertAccounts(organizationId, connectorId, accounts);
}

export async function getAccountsForConnector(
  organizationId: string,
  connectorId: string,
): Promise<BankAccount[]> {
  return bankRepository.getAccountsForConnector(organizationId, connectorId);
}

export async function getAllAccounts(organizationId: string): Promise<BankAccount[]> {
  return bankRepository.getAllAccounts(organizationId);
}

export async function markAccountsStatus(
  organizationId: string,
  connectorId: string,
  status: AccountStatus,
): Promise<void> {
  return bankRepository.markAccountsStatus(organizationId, connectorId, status);
}

/** A read-only snapshot combining live instance data with persisted
 * metadata — mirrors lib/banks/registry.ts::getAllConnectorRecords
 * exactly, now organization-scoped. */
export async function getAllConnectorRecords(
  organizationId: string,
): Promise<ConnectorRecord[]> {
  const states = await bankRepository.getAllStates(organizationId);
  const now = new Date().toISOString();
  return getAllConnectors().map((connector) => {
    const persisted = states[connector.id];
    return {
      id: connector.id,
      name: connector.name,
      institution: connector.institution,
      country: connector.country,
      version: connector.version,
      enabled: persisted?.enabled ?? false,
      connection: persisted?.lastConnection ?? "disconnected",
      health: persisted?.lastHealth ?? {
        status: "disconnected",
        message: "Not yet checked.",
        checkedAt: now,
      },
      lastSync: persisted?.lastSync ?? null,
      supportedAccounts: connector.supportedAccounts(),
      supportedFeatures: connector.supportedFeatures(),
      metadata: connector.metadata(),
      installedAt: persisted?.installedAt ?? now,
      updatedAt: persisted?.updatedAt ?? now,
    };
  });
}

export async function getConnectorRecord(
  organizationId: string,
  id: string,
): Promise<ConnectorRecord | undefined> {
  const records = await getAllConnectorRecords(organizationId);
  return records.find((r) => r.id === id);
}

export async function clearConnectorState(organizationId: string): Promise<void> {
  return bankRepository.clearConnectorState(organizationId);
}
