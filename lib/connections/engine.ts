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
  getConnectionRecord,
  getStoredConnection,
  recordHealth,
  toConnectionRecord,
  upsertStoredConnection,
} from "@/lib/connections/registry";
import { runWorkflowsForTrigger } from "@/lib/workflows/engine";
import { registerFeedContributor } from "@/lib/feed/engine";
import { registerIndexContributor } from "@/lib/index";
import { registerCoachImportSummaryContributor, type CoachImportSummaryContribution } from "@/lib/coach/contributors";
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
  existingConnectionId?: string;
}

/** Completes the Authorization Code exchange — the Route Handler calls
 * this only after verifying the callback's `state` matches the OAuth
 * session cookie it set at startConnection() time; state validation
 * itself belongs to the Route Handler, not here, since it's the one
 * holding both values. */
export async function completeConnection(input: CompleteConnectionInput): Promise<ConnectionRecord> {
  const provider = getProvider(input.providerId);
  const stored = await provider.connect({
    code: input.code,
    codeVerifier: input.codeVerifier,
    redirectUri: input.redirectUri,
    existingConnectionId: input.existingConnectionId,
  });
  await runWorkflowsForTrigger("account-connected", { connectionId: stored.id, provider: stored.provider, email: stored.email }, new Date());
  return toConnectionRecord(stored);
}

// --- Disconnect / Refresh / Rename ------------------------------------------

export async function disconnectConnection(id: string): Promise<ConnectionRecord | undefined> {
  const existing = getStoredConnection(id);
  if (!existing) return undefined;
  await getProvider(existing.provider).disconnect(id);
  await runWorkflowsForTrigger("disconnect", { connectionId: id, provider: existing.provider }, new Date());
  return getConnectionRecord(id);
}

export async function refreshConnection(id: string): Promise<ConnectionRecord> {
  const existing = getStoredConnection(id);
  if (!existing) throw new Error(`Connection "${id}" not found.`);

  try {
    const updated = await getProvider(existing.provider).refreshToken(id);
    await runWorkflowsForTrigger("connection-token-refreshed", { connectionId: id, provider: existing.provider }, new Date());
    return toConnectionRecord(updated);
  } catch (error) {
    const latest = getStoredConnection(id) ?? existing;
    const trigger = latest.status === "permission-revoked" ? "connection-permission-revoked" : "connection-failed";
    await runWorkflowsForTrigger(
      trigger,
      { connectionId: id, provider: existing.provider, error: error instanceof Error ? error.message : "Unknown error" },
      new Date(),
    );
    throw error;
  }
}

export function renameConnection(id: string, displayName: string): ConnectionRecord | undefined {
  const existing = getStoredConnection(id);
  if (!existing) return undefined;
  const trimmed = displayName.trim();
  if (!trimmed) return toConnectionRecord(existing);

  const now = new Date().toISOString();
  const event: ConnectionHistoryEvent = { type: "renamed", at: now, message: `Renamed to "${trimmed}".` };
  const updated = { ...existing, displayName: trimmed, lastActivity: now, history: [...existing.history, event].slice(-50) };
  upsertStoredConnection(updated);
  return toConnectionRecord(updated);
}

/** The live Health Monitoring check — asks the provider to validate (and,
 * if near expiry, proactively refresh) the token, then persists and
 * returns the result. Fires the matching Workflow trigger when health
 * degrades to a state the spec calls out. */
export async function checkAndRecordHealth(id: string): Promise<ConnectionRecord | undefined> {
  const existing = getStoredConnection(id);
  if (!existing) return undefined;

  const health = await checkConnectionHealth(getProvider(existing.provider), existing);
  recordHealth(id, health);

  if (health.status === "permission-revoked") {
    await runWorkflowsForTrigger("connection-permission-revoked", { connectionId: id, provider: existing.provider }, new Date());
  } else if (health.status === "authentication-failed") {
    await runWorkflowsForTrigger("connection-failed", { connectionId: id, provider: existing.provider }, new Date());
  }
  return getConnectionRecord(id);
}

// --- Reads (UI-safe) ---------------------------------------------------------

export function getConnections(): ConnectionRecord[] {
  return getAllConnectionRecords();
}

export function getConnectionDetails(id: string): ConnectionRecord | undefined {
  return getConnectionRecord(id);
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

  for (const record of getAllConnectionRecords()) {
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
  return getAllConnectionRecords().map((record) => {
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
  const all = getAllConnectionRecords();
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
