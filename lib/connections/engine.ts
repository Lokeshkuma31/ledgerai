/**
 * Engine — Core Connection Orchestration. The only module Route Handlers
 * and Server Actions call into; everything below (registry, providers,
 * oauth, token-manager, session, health) stays reachable only through
 * here or through each other. Deliberately framework-agnostic: no
 * `next/headers`/`next/navigation` import anywhere in this file, so it's
 * plain-function testable with Vitest without mocking a request context.
 */
import { generatePKCEPair, generateState } from "@/lib/connections/oauth";
import { checkConnectionHealth } from "@/lib/connections/health";
import { getProvider, PROVIDERS } from "@/lib/connections/providers";
import {
  getAllConnectionRecords,
  getAllConnectionRecordsUnscoped,
  getConnectionRecord,
  getStoredConnection,
  recordHealth,
  toConnectionRecord,
  upsertStoredConnection,
} from "@/lib/connections/registry";
import { dispatch } from "@/lib/jobs/dispatcher";
import { buildKey } from "@/lib/jobs/idempotency";
import { registerFeedContributor } from "@/lib/feed/engine";
import { registerIndexContributor } from "@/lib/index";
import { registerCoachImportSummaryContributor, type CoachImportSummaryContribution } from "@/lib/coach/contributors";
import { assertOwnership } from "@/lib/auth/authorize";
import { recordAuditEvent } from "@/lib/audit/log";
import type { ConnectionHistoryEvent, ConnectionRecord, ProviderDescriptor, ProviderId } from "@/lib/connections/types";
import type { FeedItem } from "@/types/feed";
import type { IndexedObject } from "@/types/index";

// --- Start / Complete (the Authorization Code round-trip) ------------------

export interface StartConnectionResult {
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
}

/** Builds the redirect URL for a fresh Connect or a Reconnect — the
 * Route Handler persists `state`/`codeVerifier` into the short-lived OAuth
 * session cookie (session.ts) before redirecting the browser to
 * `authorizationUrl`. */
export function startConnection(providerId: ProviderId, redirectUri: string): StartConnectionResult {
  const provider = getProvider(providerId);
  const { codeVerifier, codeChallenge } = generatePKCEPair();
  const state = generateState();
  const authorizationUrl = provider.buildAuthorizationUrl({ state, codeChallenge, redirectUri });
  return { authorizationUrl, state, codeVerifier };
}

export interface CompleteConnectionInput {
  providerId: ProviderId;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  /** The signed-in Better Auth user completing this connection — resolved
   * from the session by the Route Handler. */
  userId: string;
  existingConnectionId?: string;
}

/** Completes the Authorization Code exchange — the Route Handler calls
 * this only after verifying the callback's `state` matches the OAuth
 * session cookie it set at startConnection() time; state validation
 * itself belongs to the Route Handler, not here, since it's the one
 * holding both values.
 *
 * `existingConnectionId` (a Reconnect) is independently re-verified for
 * ownership here — never trust that the Route Handler/cookie that
 * produced it already checked, since this is the layer that actually
 * handles token material (see docs/security-hardening/03-idor-verification-report.md,
 * Finding 2, for why an unverified reconnect id is exploitable). */
export async function completeConnection(input: CompleteConnectionInput): Promise<ConnectionRecord> {
  const provider = getProvider(input.providerId);

  if (input.existingConnectionId) {
    const existing = await getStoredConnection(input.existingConnectionId);
    if (existing) {
      await assertOwnership({
        resourceUserId: existing.userId,
        currentUserId: input.userId,
        entityType: "connection",
        entityId: input.existingConnectionId,
      });
    }
  }

  const stored = await provider.connect({
    code: input.code,
    codeVerifier: input.codeVerifier,
    redirectUri: input.redirectUri,
    userId: input.userId,
    existingConnectionId: input.existingConnectionId,
  });
  await dispatch(
    "ledger/workflow.trigger",
    { trigger: "account-connected", payload: { connectionId: stored.id, provider: stored.provider, email: stored.email } },
    { id: buildKey("workflow-trigger", "account-connected", stored.id) },
  ).catch(() => undefined);
  await dispatch(
    "ledger/connection.created",
    { connectionId: stored.id, provider: stored.provider },
    { id: buildKey("connection-created", stored.id) },
  ).catch(() => undefined);
  const record = toConnectionRecord(stored);
  const isReconnect = stored.history.at(-1)?.type === "reconnected";
  await recordAuditEvent({
    action: isReconnect ? "connection.reconnected" : "connection.created",
    entityType: "connection",
    entityId: stored.id,
    userId: input.userId,
    after: record,
  });
  await refreshConnectionCache();
  return record;
}

/** Ownership check usable by Route Handlers before they even start an
 * OAuth round-trip (e.g. the authorize route's `?reconnect=<id>` param) —
 * kept here rather than in registry.ts so callers never need to reach for
 * getStoredConnection() (which carries token material) themselves. */
export async function isConnectionOwnedBy(id: string, userId: string): Promise<boolean> {
  const existing = await getStoredConnection(id);
  return existing?.userId === userId;
}

// --- Disconnect / Refresh / Rename ------------------------------------------

export async function disconnectConnection(id: string, userId: string): Promise<ConnectionRecord | undefined> {
  const existing = await getStoredConnection(id);
  if (!existing) return undefined;
  await assertOwnership({ resourceUserId: existing.userId, currentUserId: userId, entityType: "connection", entityId: id });

  await getProvider(existing.provider).disconnect(id);
  // No explicit dedup id: a disconnect is a discrete user action each
  // time, not a chatty retry — see docs/job-platform/04-queue-strategy.md
  // §4.6 ("omit only for events where duplicate delivery is genuinely
  // harmless"), which holds here since every downstream consumer
  // (connection-validate, cleanup) is itself idempotent.
  await dispatch("ledger/workflow.trigger", {
    trigger: "disconnect",
    payload: { connectionId: id, provider: existing.provider },
  }).catch(() => undefined);
  await dispatch("ledger/connection.disconnected", { connectionId: id, provider: existing.provider }).catch(() => undefined);
  await recordAuditEvent({
    action: "connection.disconnected",
    entityType: "connection",
    entityId: id,
    userId,
    before: toConnectionRecord(existing),
  });
  await refreshConnectionCache();
  return getConnectionRecord(id);
}

export async function refreshConnection(id: string, userId: string): Promise<ConnectionRecord> {
  const existing = await getStoredConnection(id);
  if (!existing) throw new Error(`Connection "${id}" not found.`);
  await assertOwnership({ resourceUserId: existing.userId, currentUserId: userId, entityType: "connection", entityId: id });

  try {
    const updated = await getProvider(existing.provider).refreshToken(id);
    await dispatch("ledger/workflow.trigger", {
      trigger: "connection-token-refreshed",
      payload: { connectionId: id, provider: existing.provider },
    }).catch(() => undefined);
    await recordAuditEvent({ action: "connection.token_refreshed", entityType: "connection", entityId: id, userId });
    await refreshConnectionCache();
    return toConnectionRecord(updated);
  } catch (error) {
    const latest = (await getStoredConnection(id)) ?? existing;
    const revoked = latest.status === "permission-revoked";
    const trigger = revoked ? "connection-permission-revoked" : "connection-failed";
    await dispatch("ledger/workflow.trigger", {
      trigger,
      payload: { connectionId: id, provider: existing.provider, error: error instanceof Error ? error.message : "Unknown error" },
    }).catch(() => undefined);
    await recordAuditEvent({
      action: revoked ? "connection.permission_revoked" : "connection.token_refresh_failed",
      entityType: "connection",
      entityId: id,
      userId,
    });
    await refreshConnectionCache();
    throw error;
  }
}

export async function renameConnection(id: string, displayName: string, userId: string): Promise<ConnectionRecord | undefined> {
  const existing = await getStoredConnection(id);
  if (!existing) return undefined;
  await assertOwnership({ resourceUserId: existing.userId, currentUserId: userId, entityType: "connection", entityId: id });

  const trimmed = displayName.trim();
  if (!trimmed) return toConnectionRecord(existing);

  const now = new Date().toISOString();
  const event: ConnectionHistoryEvent = { type: "renamed", at: now, message: `Renamed to "${trimmed}".` };
  const updated = { ...existing, displayName: trimmed, lastActivity: now, history: [...existing.history, event].slice(-50) };
  await upsertStoredConnection(updated);
  await recordAuditEvent({
    action: "connection.renamed",
    entityType: "connection",
    entityId: id,
    userId,
    before: { displayName: existing.displayName },
    after: { displayName: trimmed },
  });
  await refreshConnectionCache();
  return toConnectionRecord(updated);
}

/** The live Health Monitoring check — asks the provider to validate (and,
 * if near expiry, proactively refresh) the token, then persists and
 * returns the result. Fires the matching Workflow trigger when health
 * degrades to a state the spec calls out. */
export async function checkAndRecordHealth(id: string, userId: string): Promise<ConnectionRecord | undefined> {
  const existing = await getStoredConnection(id);
  if (!existing) return undefined;
  await assertOwnership({ resourceUserId: existing.userId, currentUserId: userId, entityType: "connection", entityId: id });

  const health = await checkConnectionHealth(getProvider(existing.provider), existing);
  await recordHealth(id, health);

  if (health.status === "permission-revoked") {
    await dispatch("ledger/workflow.trigger", {
      trigger: "connection-permission-revoked",
      payload: { connectionId: id, provider: existing.provider },
    }).catch(() => undefined);
    await recordAuditEvent({ action: "connection.permission_revoked", entityType: "connection", entityId: id, userId });
  } else if (health.status === "authentication-failed") {
    await dispatch("ledger/workflow.trigger", {
      trigger: "connection-failed",
      payload: { connectionId: id, provider: existing.provider },
    }).catch(() => undefined);
  }
  await refreshConnectionCache();
  return getConnectionRecord(id);
}

// --- Reads (UI-safe) ---------------------------------------------------------

export async function getConnections(userId: string): Promise<ConnectionRecord[]> {
  return getAllConnectionRecords(userId);
}

export async function getConnectionDetails(id: string, userId: string): Promise<ConnectionRecord | undefined> {
  const existing = await getStoredConnection(id);
  if (!existing) return undefined;
  await assertOwnership({ resourceUserId: existing.userId, currentUserId: userId, entityType: "connection", entityId: id });
  return toConnectionRecord(existing);
}

export function getProviderDescriptors(): ProviderDescriptor[] {
  return Object.values(PROVIDERS).map((provider) => ({
    id: provider.id,
    name: provider.name,
    version: provider.version,
    type: provider.type,
    metadata: provider.metadata(),
    supportedScopes: provider.supportedScopes(),
    supportedCapabilities: provider.supportedCapabilities(),
  }));
}

// --- Feed / Search / Coach contributions -----------------------------------

/**
 * registerFeedContributor/registerIndexContributor/
 * registerCoachImportSummaryContributor (lib/feed/engine.ts, lib/index,
 * lib/coach/contributors.ts) all expect synchronous, zero-argument
 * callbacks — an app-wide assumption that predates any real database
 * (every engine's contributor has the same shape, not just Connection
 * Hub's). Now that connection reads are async Postgres queries, this
 * in-memory cache — refreshed after every mutating engine.ts operation —
 * is what lets those three contributor functions keep their required
 * synchronous signature without a cross-cutting rewrite of the entire
 * contributor system. It only ever reflects the state as of the last
 * mutation made through this module, and (per
 * getAllStoredConnectionsUnscoped's own doc comment) is unscoped across
 * all users, matching this app's pre-existing single-tenant assumption in
 * every other engine's contributors — properly scoping Feed/Index/Coach
 * generation per organization is a larger, separate effort.
 */
let connectionRecordsCache: ConnectionRecord[] = [];

async function refreshConnectionCache(): Promise<void> {
  connectionRecordsCache = await getAllConnectionRecordsUnscoped();
}

// Best-effort warm at module load so the cache isn't empty before the
// first mutation — failures here (e.g. DB unreachable at cold start)
// are swallowed since contributors degrade gracefully to an empty list.
void refreshConnectionCache().catch(() => undefined);

const PROVIDER_NAMES: Record<ProviderId, string> = { google: "Gmail", microsoft: "Outlook", yahoo: "Yahoo Mail" };

function lastLifecycleEvent(record: ConnectionRecord): ConnectionHistoryEvent | undefined {
  for (let i = record.history.length - 1; i >= 0; i -= 1) {
    if (record.history[i].type !== "renamed") return record.history[i];
  }
  return undefined;
}

/** One item per connection's most recent lifecycle event — covers the
 * spec's exact four titles ("[Provider] connected", "[Provider]
 * disconnected", "Connection expired", "Connection restored"), the last
 * one only firing when the event is specifically a *re*connect (not the
 * original connect), so a first-time connection is never mislabeled. */
function buildConnectionFeedItems(): FeedItem[] {
  const items: FeedItem[] = [];

  for (const record of connectionRecordsCache) {
    const event = lastLifecycleEvent(record);
    if (!event) continue;
    const label = PROVIDER_NAMES[record.provider];
    const base = {
      priority: 0, // recomputed by lib/feed/prioritizer.ts
      sourceEngine: "feed" as const,
      explanationId: null,
      isRead: false,
      isPinned: false,
      isDismissed: false,
      expiresAt: null,
      confidence: 1,
      relatedObjectIds: [] as string[],
      metadata: { connectionId: record.id, provider: record.provider },
    };

    if (event.type === "connected") {
      items.push({ ...base, id: `connection:${record.id}:connected`, type: "system-insight", title: `${label} connected`, summary: `${label} (${record.email}) is now connected.`, severity: "info", createdAt: event.at });
    } else if (event.type === "reconnected") {
      items.push({ ...base, id: `connection:${record.id}:restored:${event.at}`, type: "system-insight", title: "Connection restored", summary: `${label} (${record.email}) was reconnected and is healthy again.`, severity: "info", createdAt: event.at });
    } else if (event.type === "disconnected") {
      items.push({ ...base, id: `connection:${record.id}:disconnected`, type: "system-insight", title: `${label} disconnected`, summary: `${label} (${record.email}) was disconnected.`, severity: "warning", createdAt: event.at });
    } else if (event.type === "permission-revoked" || event.type === "validation-failed") {
      items.push({ ...base, id: `connection:${record.id}:expired:${event.at}`, type: "system-insight", title: "Connection expired", summary: `${label} (${record.email})'s connection needs attention: ${event.message}`, severity: "warning", createdAt: event.at });
    }
  }

  return items;
}

function buildConnectionIndexObjects(): IndexedObject[] {
  return connectionRecordsCache.map((record) => {
    const label = PROVIDER_NAMES[record.provider];
    return {
      id: `connection:${record.id}`,
      type: "connection",
      title: `${label} — ${record.email || record.displayName}`,
      description: `Status: ${record.status}; health: ${record.health.status}.`,
      keywords: [record.provider, record.email, record.displayName, ...record.scopes],
      date: record.connectedAt.slice(0, 10),
      tags: ["connection", record.provider, record.status],
      metadata: {
        connectionId: record.id,
        provider: record.provider,
        status: record.status,
        health: record.health.status,
        scopes: record.scopes,
        historyCount: record.history.length,
      },
      createdAt: record.connectedAt,
      updatedAt: record.lastActivity,
      searchableText: `${label} ${record.email} ${record.displayName} ${record.provider} ${record.status}`.toLowerCase(),
    };
  });
}

/** Structured, pre-computed counts only — the AI Financial Coach narrates
 * these, it never accesses a token or calls a provider itself. Reuses the
 * existing generic import-summary Coach extension point (the same one
 * plugins/account-aggregator and plugins/document-intelligence use)
 * rather than adding a third bespoke contribution shape: "healthy
 * connections" maps to `importedCount`, "connections needing attention" to
 * `failedCount`. The fit is imperfect (there's no real "duplicate" or
 * "import" concept for an OAuth connection) — a dedicated
 * ConnectionCoachSummary shape wired into
 * lib/intelligence/orchestrator.ts's CoachInput assembly would be the
 * correct enhancement, but that crosses into shared orchestrator code
 * this milestone deliberately leaves untouched. */
function getCoachSummary(): CoachImportSummaryContribution | null {
  const all = connectionRecordsCache;
  if (all.length === 0) return null;

  const healthy = all.filter((r) => r.health.status === "healthy").length;
  const needsAttention = all.filter((r) => r.health.status !== "healthy" && r.status !== "disconnected").length;
  const lastValidated = all
    .map((r) => r.lastValidated)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);

  return {
    pluginName: "Connection Hub",
    totalMessages: all.length,
    importedCount: healthy,
    duplicateCount: 0,
    failedCount: needsAttention,
    lastImportAt: lastValidated ?? null,
  };
}

registerFeedContributor(buildConnectionFeedItems);
registerIndexContributor(buildConnectionIndexObjects);
registerCoachImportSummaryContributor(getCoachSummary);
