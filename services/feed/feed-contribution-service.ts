/**
 * Feed Contribution Service — the pull-model resolution of the
 * contributor-callback architecture question (migration plan §7 risk 1).
 *
 * lib/feed/engine.ts::generateFeed and its sibling registerFeedContributor/
 * registerIndexContributor/registerCoach*Contributor registries stay
 * exactly as they are — synchronous, zero-arg, still serving every
 * existing caller (including Client Components like
 * components/WorkflowsOverview.tsx, which this backend-only migration
 * pass deliberately doesn't touch). lib/connections/engine.ts's
 * connectionRecordsCache workaround (a module-level cache refreshed after
 * every mutation, explicitly documented there as unscoped-across-users)
 * exists solely to let an async Postgres read masquerade as a synchronous
 * contributor callback for that old path.
 *
 * This module is the new path: whichever async orchestrator eventually
 * generates a Feed for real (a Route Handler, Server Action, or the
 * future workflow-execute.ts Inngest function per the migration plan's
 * background-job architecture) calls these functions directly, scoped by
 * organizationId/userId, instead of registering a callback. No cache, no
 * unscoped global state — each call reads Postgres fresh. This is the
 * template every other migrated domain's contributor logic (Bank, Email,
 * Sync) follows as each gets wired into the new async Feed generation
 * path; only Connection Hub's is implemented here for now.
 */
import * as connectionRegistry from "@/lib/connections/registry";
import type {
  ConnectionHistoryEvent,
  ConnectionRecord,
  ProviderId,
} from "@/lib/connections/types";
import type { FeedItem } from "@/types/feed";
import type { IndexedObject } from "@/types/index";
import type { CoachImportSummaryContribution } from "@/lib/coach/contributors";

const PROVIDER_NAMES: Record<ProviderId, string> = {
  google: "Gmail",
  microsoft: "Outlook",
  yahoo: "Yahoo Mail",
};

function lastLifecycleEvent(record: ConnectionRecord): ConnectionHistoryEvent | undefined {
  for (let i = record.history.length - 1; i >= 0; i -= 1) {
    if (record.history[i].type !== "renamed") return record.history[i];
  }
  return undefined;
}

/** Mirrors lib/connections/engine.ts::buildConnectionFeedItems exactly —
 * same four lifecycle-event titles, same field shapes — sourced from a
 * fresh, user-scoped Postgres read instead of the unscoped module cache. */
export async function collectConnectionFeedItems(userId: string): Promise<FeedItem[]> {
  const records = await connectionRegistry.getAllConnectionRecords(userId);
  const items: FeedItem[] = [];

  for (const record of records) {
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

/** Mirrors lib/connections/engine.ts::buildConnectionIndexObjects exactly. */
export async function collectConnectionIndexObjects(userId: string): Promise<IndexedObject[]> {
  const records = await connectionRegistry.getAllConnectionRecords(userId);
  return records.map((record) => {
    const label = PROVIDER_NAMES[record.provider];
    return {
      id: `connection:${record.id}`,
      type: "connection" as const,
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

/** Mirrors lib/connections/engine.ts::getCoachSummary exactly. */
export async function collectConnectionCoachSummary(
  userId: string,
): Promise<CoachImportSummaryContribution | null> {
  const all = await connectionRegistry.getAllConnectionRecords(userId);
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
