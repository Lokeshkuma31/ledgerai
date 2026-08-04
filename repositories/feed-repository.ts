/**
 * Feed Repository — Postgres-backed persistence for
 * lib/feed/registry.ts's successor. FeedItem.key (the deterministic
 * composite string, e.g. "feed:budget:warning:${statusId}") is the
 * app-facing id everywhere below; Prisma's own `id` is a separate cuid
 * for the same multi-tenant reason as WorkflowDefinition.key.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/src/generated/prisma/client";
import type { FeedItem as PrismaFeedItem } from "@/src/generated/prisma/client";
import type { FeedItem, FeedItemType, FeedSeverity, FeedSourceEngine } from "@/types/feed";

function toFeedItem(row: PrismaFeedItem): FeedItem {
  return {
    id: row.key,
    type: row.type as FeedItemType,
    title: row.title,
    summary: row.summary,
    priority: row.priority,
    severity: row.severity as FeedSeverity,
    sourceEngine: row.sourceEngine as FeedSourceEngine,
    relatedObjectIds: row.relatedObjectIds,
    explanationId: row.explanationId,
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    isRead: row.isRead,
    isPinned: row.isPinned,
    isDismissed: row.isDismissed,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

/** Upserts one item by (organizationId, key), preserving createdAt/isRead/
 * isPinned/isDismissed on an existing row — mirrors lib/feed/registry.ts::
 * upsertFeedItem exactly. A plain Prisma `update` naturally leaves fields
 * absent from its `data` untouched, so simply omitting those 4 fields from
 * the update clause (unlike create, which sets them fresh) reproduces the
 * old fetch-then-merge behavior without a separate read. */
export async function upsertFeedItem(
  organizationId: string,
  item: FeedItem,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<FeedItem> {
  const row = await client.feedItem.upsert({
    where: { organizationId_key: { organizationId, key: item.id } },
    create: {
      key: item.id,
      organizationId,
      type: item.type,
      title: item.title,
      summary: item.summary,
      priority: item.priority,
      severity: item.severity,
      sourceEngine: item.sourceEngine,
      relatedObjectIds: item.relatedObjectIds,
      explanationId: item.explanationId,
      confidence: item.confidence,
      expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
      isRead: item.isRead,
      isPinned: item.isPinned,
      isDismissed: item.isDismissed,
      metadata: item.metadata as Prisma.InputJsonValue,
    },
    update: {
      type: item.type,
      title: item.title,
      summary: item.summary,
      priority: item.priority,
      severity: item.severity,
      sourceEngine: item.sourceEngine,
      relatedObjectIds: item.relatedObjectIds,
      explanationId: item.explanationId,
      confidence: item.confidence,
      expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
      metadata: item.metadata as Prisma.InputJsonValue,
      // Deliberately absent: createdAt (immutable once created), isRead/
      // isPinned/isDismissed (user-driven state a regeneration must not
      // clobber).
    },
  });
  return toFeedItem(row);
}

/**
 * Upserts a full generation batch and deletes any previously persisted
 * item whose key wasn't regenerated this run, mirroring
 * lib/feed/registry.ts::reconcileFeedItems exactly — its localStorage
 * version's final writeFeedItems(reconciled) call replaced the *entire*
 * store with just the new batch, which is exactly "upsert what's here,
 * delete what isn't" once expressed against a real table instead of a
 * single JSON blob.
 */
export async function reconcileFeedItems(
  organizationId: string,
  items: FeedItem[],
): Promise<FeedItem[]> {
  return prisma.$transaction(async (tx) => {
    const reconciled = await Promise.all(items.map((item) => upsertFeedItem(organizationId, item, tx)));
    await tx.feedItem.deleteMany({
      where: { organizationId, key: { notIn: items.map((i) => i.id) } },
    });
    return reconciled;
  });
}

export async function getAllFeedItems(organizationId: string): Promise<FeedItem[]> {
  const rows = await prisma.feedItem.findMany({ where: { organizationId } });
  return rows.map(toFeedItem);
}

export async function getFeedItemById(
  organizationId: string,
  id: string,
): Promise<FeedItem | undefined> {
  const row = await prisma.feedItem.findUnique({
    where: { organizationId_key: { organizationId, key: id } },
  });
  return row ? toFeedItem(row) : undefined;
}

export async function getFeedItemsByType(
  organizationId: string,
  type: FeedItemType,
): Promise<FeedItem[]> {
  const rows = await prisma.feedItem.findMany({ where: { organizationId, type } });
  return rows.map(toFeedItem);
}

export async function getFeedItemsBySourceEngine(
  organizationId: string,
  engine: FeedSourceEngine,
): Promise<FeedItem[]> {
  const rows = await prisma.feedItem.findMany({ where: { organizationId, sourceEngine: engine } });
  return rows.map(toFeedItem);
}

async function updateFeedItem(
  organizationId: string,
  id: string,
  patch: Partial<Pick<FeedItem, "isRead" | "isPinned" | "isDismissed">>,
): Promise<FeedItem | undefined> {
  const row = await prisma.feedItem
    .update({ where: { organizationId_key: { organizationId, key: id } }, data: patch })
    .catch(() => undefined);
  return row ? toFeedItem(row) : undefined;
}

export async function markFeedItemRead(
  organizationId: string,
  id: string,
): Promise<FeedItem | undefined> {
  return updateFeedItem(organizationId, id, { isRead: true });
}

export async function markAllFeedItemsRead(organizationId: string): Promise<void> {
  await prisma.feedItem.updateMany({ where: { organizationId }, data: { isRead: true } });
}

export async function pinFeedItem(
  organizationId: string,
  id: string,
): Promise<FeedItem | undefined> {
  return updateFeedItem(organizationId, id, { isPinned: true });
}

export async function unpinFeedItem(
  organizationId: string,
  id: string,
): Promise<FeedItem | undefined> {
  return updateFeedItem(organizationId, id, { isPinned: false });
}

export async function dismissFeedItem(
  organizationId: string,
  id: string,
): Promise<FeedItem | undefined> {
  return updateFeedItem(organizationId, id, { isDismissed: true });
}

/** Un-dismisses a feed item — also the way an auto-expired ("archived")
 * item is brought back. */
export async function restoreFeedItem(
  organizationId: string,
  id: string,
): Promise<FeedItem | undefined> {
  return updateFeedItem(organizationId, id, { isDismissed: false });
}

/** Archives (dismisses without deleting) any item whose expiresAt has
 * passed, mirroring lib/feed/registry.ts::expireFeedItems. */
export async function expireFeedItems(
  organizationId: string,
  now: Date = new Date(),
): Promise<void> {
  await prisma.feedItem.updateMany({
    where: { organizationId, isDismissed: false, expiresAt: { lte: now } },
    data: { isDismissed: true },
  });
}

export async function clearFeedItems(organizationId: string): Promise<void> {
  await prisma.feedItem.deleteMany({ where: { organizationId } });
}
