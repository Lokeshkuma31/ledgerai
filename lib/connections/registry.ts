/**
 * Connection Registry — server-only persistence for StoredConnection
 * (including its encrypted token material) plus the sanitized
 * ConnectionRecord projection that is the only thing anything outside
 * lib/connections/ is ever allowed to read.
 *
 * This app has no database; every other framework here persists to
 * `localStorage` as a stand-in for one, but tokens can never touch
 * client-side storage (the spec's "never expose to the UI" is
 * non-negotiable), so this registry persists instead to a JSON file under
 * a server-only, gitignored directory via Node's `fs` module — reachable
 * only from Route Handlers, Server Actions, and other lib/connections/
 * modules, never from a "use client" file (which couldn't import
 * `node:fs` in the first place; Next.js refuses that at build time).
 * A real production deployment would swap this file-backed store for a
 * proper encrypted-at-rest database table — nothing above this module's
 * function signatures would need to change.
 */
import fs from "node:fs";
import path from "node:path";
import type { ConnectionHealth, ConnectionHistoryEvent, ConnectionRecord, ProviderId, StoredConnection } from "@/lib/connections/types";

const DATA_DIR = path.join(process.cwd(), ".connections-data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const MAX_HISTORY = 50;

function readStore(): StoredConnection[] {
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredConnection[]) : [];
  } catch {
    return [];
  }
}

function writeStore(records: StoredConnection[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), "utf8");
}

// --- internal (server-only) reads/writes — carry token material ------------

export function getStoredConnection(id: string): StoredConnection | undefined {
  return readStore().find((r) => r.id === id);
}

export function findStoredConnectionByAccount(provider: ProviderId, providerAccountId: string): StoredConnection | undefined {
  return readStore().find((r) => r.provider === provider && r.providerAccountId === providerAccountId);
}

export function getAllStoredConnections(): StoredConnection[] {
  return readStore();
}

export function upsertStoredConnection(record: StoredConnection): void {
  const all = readStore();
  const index = all.findIndex((r) => r.id === record.id);
  if (index === -1) {
    writeStore([...all, record]);
  } else {
    all[index] = record;
    writeStore(all);
  }
}

export function deleteStoredConnection(id: string): void {
  writeStore(readStore().filter((r) => r.id !== id));
}

export function appendHistory(id: string, event: ConnectionHistoryEvent): StoredConnection | undefined {
  const record = getStoredConnection(id);
  if (!record) return undefined;
  const updated: StoredConnection = { ...record, history: [...record.history, event].slice(-MAX_HISTORY) };
  upsertStoredConnection(updated);
  return updated;
}

export function recordHealth(id: string, health: ConnectionHealth): StoredConnection | undefined {
  const record = getStoredConnection(id);
  if (!record) return undefined;
  const updated: StoredConnection = { ...record, health };
  upsertStoredConnection(updated);
  return updated;
}

export function clearConnectionRegistry(): void {
  writeStore([]);
}

// --- public (UI-safe) reads — never carry token material --------------------

/** The only place a StoredConnection's `tokens` field is dropped —
 * everything reachable from a Client Component goes through this. */
export function toConnectionRecord(stored: StoredConnection): ConnectionRecord {
  const { tokens, ...rest } = stored;
  return { ...rest, scopes: tokens?.scopes ?? [], tokenExpiresAt: tokens?.expiresAt ?? null };
}

export function getAllConnectionRecords(): ConnectionRecord[] {
  return readStore().map(toConnectionRecord);
}

export function getConnectionRecord(id: string): ConnectionRecord | undefined {
  const stored = getStoredConnection(id);
  return stored ? toConnectionRecord(stored) : undefined;
}
