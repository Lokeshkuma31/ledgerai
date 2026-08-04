/**
 * Connection Registry — server-only persistence for StoredConnection
 * (including its encrypted token material) plus the sanitized
 * ConnectionRecord projection that is the only thing anything outside
 * lib/connections/ is ever allowed to read.
 *
 * Persists to Postgres via repositories/connection-repository.ts — the
 * production successor to this module's original file-backed JSON store
 * (`.connections-data/store.json`), migrated per
 * scripts/migrate-connections-store.ts. Every function below keeps the
 * same name and argument shape it always had; the only change forced by
 * a real database is that reads/writes are now async, and
 * account-lookup/listing functions take a `userId` to scope their query
 * now that connections belong to real Better Auth users instead of an
 * implicit single local user.
 */
import * as connectionRepository from "@/repositories/connection-repository";
import type { ConnectionHealth, ConnectionHistoryEvent, ConnectionRecord, ProviderId, StoredConnection } from "@/lib/connections/types";

const MAX_HISTORY = 50;

// --- internal (server-only) reads/writes — carry token material ------------

export async function getStoredConnection(id: string): Promise<StoredConnection | undefined> {
  return connectionRepository.getStoredConnection(id);
}

export async function findStoredConnectionByAccount(userId: string, provider: ProviderId, providerAccountId: string): Promise<StoredConnection | undefined> {
  return connectionRepository.findStoredConnectionByAccount(userId, provider, providerAccountId);
}

export async function getAllStoredConnections(userId: string): Promise<StoredConnection[]> {
  return connectionRepository.getAllStoredConnections(userId);
}

export async function upsertStoredConnection(record: StoredConnection): Promise<void> {
  return connectionRepository.upsertStoredConnection(record);
}

export async function deleteStoredConnection(id: string): Promise<void> {
  return connectionRepository.deleteStoredConnection(id);
}

export async function appendHistory(id: string, event: ConnectionHistoryEvent): Promise<StoredConnection | undefined> {
  const record = await getStoredConnection(id);
  if (!record) return undefined;
  const updated: StoredConnection = { ...record, history: [...record.history, event].slice(-MAX_HISTORY) };
  await upsertStoredConnection(updated);
  return updated;
}

export async function recordHealth(id: string, health: ConnectionHealth): Promise<StoredConnection | undefined> {
  const record = await getStoredConnection(id);
  if (!record) return undefined;
  const updated: StoredConnection = { ...record, health };
  await upsertStoredConnection(updated);
  return updated;
}

export async function clearConnectionRegistry(): Promise<void> {
  return connectionRepository.clearConnectionRegistry();
}

// --- public (UI-safe) reads — never carry token material --------------------

/** The only place a StoredConnection's `tokens` field is dropped —
 * everything reachable from a Client Component goes through this. */
export function toConnectionRecord(stored: StoredConnection): ConnectionRecord {
  const { tokens, userId, ...rest } = stored;
  void userId; // dropped deliberately — see the interface doc comment above
  return { ...rest, scopes: tokens?.scopes ?? [], tokenExpiresAt: tokens?.expiresAt ?? null };
}

export async function getAllConnectionRecords(userId: string): Promise<ConnectionRecord[]> {
  const stored = await getAllStoredConnections(userId);
  return stored.map(toConnectionRecord);
}

export async function getConnectionRecord(id: string): Promise<ConnectionRecord | undefined> {
  const stored = await getStoredConnection(id);
  return stored ? toConnectionRecord(stored) : undefined;
}

/** Unscoped read used only by engine.ts's Feed/Index/Coach contributors —
 * see repositories/connection-repository.ts's getAllStoredConnectionsUnscoped
 * for why (a pre-existing, app-wide synchronous-contributor limitation,
 * not specific to Connection Hub). */
export async function getAllConnectionRecordsUnscoped(): Promise<ConnectionRecord[]> {
  const stored = await connectionRepository.getAllStoredConnectionsUnscoped();
  return stored.map(toConnectionRecord);
}
