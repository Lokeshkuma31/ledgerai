/**
 * Connection Repository — the Postgres-backed successor to
 * lib/connections/registry.ts's file-backed store. This is the only
 * module that imports @prisma/client for Connection data; registry.ts
 * delegates here and keeps the same public function shapes it always
 * had (see its own comments), just async now since real DB access
 * requires it.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/src/generated/prisma/client";
import type { Connection as PrismaConnection, ConnectionProvider as PrismaConnectionProvider, ConnectionStatus as PrismaConnectionStatus } from "@/src/generated/prisma/client";
import type { ConnectionHealth, ConnectionHistoryEvent, ProviderId, StoredConnection, TokenSet } from "@/lib/connections/types";

const PROVIDER_TO_DB: Record<ProviderId, PrismaConnectionProvider> = { google: "GOOGLE", microsoft: "MICROSOFT", yahoo: "YAHOO" };
const PROVIDER_FROM_DB: Record<PrismaConnectionProvider, ProviderId> = { GOOGLE: "google", MICROSOFT: "microsoft", YAHOO: "yahoo" };

const STATUS_TO_DB: Record<Exclude<StoredConnection["status"], "not-connected">, PrismaConnectionStatus> = {
  connecting: "CONNECTING",
  connected: "CONNECTED",
  expired: "EXPIRED",
  disconnected: "DISCONNECTED",
  "authentication-failed": "AUTHENTICATION_FAILED",
  "permission-revoked": "PERMISSION_REVOKED",
};
const STATUS_FROM_DB: Record<PrismaConnectionStatus, Exclude<StoredConnection["status"], "not-connected">> = {
  CONNECTING: "connecting",
  CONNECTED: "connected",
  EXPIRED: "expired",
  DISCONNECTED: "disconnected",
  AUTHENTICATION_FAILED: "authentication-failed",
  PERMISSION_REVOKED: "permission-revoked",
};

function toStoredConnection(row: PrismaConnection & { history: { type: string; createdAt: Date; detail: unknown }[] }): StoredConnection {
  return {
    id: row.id,
    userId: row.userId,
    provider: PROVIDER_FROM_DB[row.provider],
    providerAccountId: row.providerAccountId,
    displayName: row.displayName,
    email: row.email,
    status: STATUS_FROM_DB[row.status],
    connectedAt: row.connectedAt.toISOString(),
    lastValidated: row.lastValidated?.toISOString() ?? null,
    lastActivity: row.lastActivity?.toISOString() ?? row.connectedAt.toISOString(),
    tokens: (row.tokens as unknown as TokenSet | null) ?? null,
    health: row.health as unknown as ConnectionHealth,
    history: row.history.map((h) => ({ type: h.type as ConnectionHistoryEvent["type"], at: h.createdAt.toISOString(), message: (h.detail as { message?: string })?.message ?? "" })),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

const includeHistory = { history: { orderBy: { createdAt: "asc" as const } } };

export async function getStoredConnection(id: string): Promise<StoredConnection | undefined> {
  const row = await prisma.connection.findUnique({ where: { id }, include: includeHistory });
  return row ? toStoredConnection(row) : undefined;
}

export async function findStoredConnectionByAccount(userId: string, provider: ProviderId, providerAccountId: string): Promise<StoredConnection | undefined> {
  const row = await prisma.connection.findFirst({
    where: { userId, provider: PROVIDER_TO_DB[provider], providerAccountId },
    include: includeHistory,
  });
  return row ? toStoredConnection(row) : undefined;
}

export async function getAllStoredConnections(userId: string): Promise<StoredConnection[]> {
  const rows = await prisma.connection.findMany({ where: { userId }, include: includeHistory, orderBy: { connectedAt: "desc" } });
  return rows.map(toStoredConnection);
}

/** Used only by the Feed/Index/Coach contributor functions in engine.ts,
 * which are synchronous, globally-registered callbacks with no per-request
 * scope anywhere in this app yet (every other engine's contributors have
 * the same limitation — it isn't specific to Connection Hub). Fixing this
 * properly means threading an organization/user scope through
 * registerFeedContributor/registerIndexContributor/
 * registerCoachImportSummaryContributor app-wide, which is out of scope
 * for the Connection Hub migration. */
export async function getAllStoredConnectionsUnscoped(): Promise<StoredConnection[]> {
  const rows = await prisma.connection.findMany({ include: includeHistory, orderBy: { connectedAt: "desc" } });
  return rows.map(toStoredConnection);
}

export async function upsertStoredConnection(record: StoredConnection): Promise<void> {
  const data = {
    userId: record.userId,
    provider: PROVIDER_TO_DB[record.provider],
    providerAccountId: record.providerAccountId,
    displayName: record.displayName,
    email: record.email,
    status: STATUS_TO_DB[record.status as Exclude<StoredConnection["status"], "not-connected">],
    connectedAt: new Date(record.connectedAt),
    lastValidated: record.lastValidated ? new Date(record.lastValidated) : null,
    lastActivity: new Date(record.lastActivity),
    tokens: record.tokens ? (record.tokens as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    tokenExpiresAt: record.tokens ? new Date(record.tokens.expiresAt) : null,
    scopes: record.tokens?.scopes ?? [],
    health: record.health as object,
    metadata: record.metadata as object,
  };

  await prisma.$transaction(async (tx) => {
    await tx.connection.upsert({ where: { id: record.id }, create: { id: record.id, ...data }, update: data });

    // History is append-only from the app's perspective (registry.ts always
    // passes the full, already-trimmed array), so reconcile by replacing
    // any rows beyond what's already persisted — cheap since lifecycle
    // events are infrequent, and simplest way to keep the relational table
    // in sync with the trimmed array's exact contents.
    const existingCount = await tx.connectionHistoryEvent.count({ where: { connectionId: record.id } });
    const newEvents = record.history.slice(existingCount);
    if (newEvents.length > 0) {
      await tx.connectionHistoryEvent.createMany({
        data: newEvents.map((event) => ({ connectionId: record.id, type: event.type, detail: { message: event.message } })),
      });
    }
  });
}

export async function deleteStoredConnection(id: string): Promise<void> {
  await prisma.connection.delete({ where: { id } }).catch(() => undefined);
}

export async function clearConnectionRegistry(): Promise<void> {
  await prisma.connection.deleteMany({});
}
