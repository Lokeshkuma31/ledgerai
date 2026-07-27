import type { FeedItem, FeedItemType, FeedSourceEngine } from "@/types/feed";

const STORAGE_KEY = "ledgerai:feed";

function readFeedItems(): FeedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FeedItem[]) : [];
  } catch {
    return [];
  }
}

function writeFeedItems(items: FeedItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * Persists one freshly generated feed item, preserving createdAt and any
 * user-driven read/pinned/dismissed state already on record for the same
 * (stable, deterministic) id — a regenerated item is an update to the same
 * record, not a new one, matching how recommendations/explanations preserve
 * identity across re-runs of their own engines.
 */
export function upsertFeedItem(item: FeedItem): FeedItem {
  const existing = readFeedItems();
  const index = existing.findIndex((i) => i.id === item.id);
  const persisted: FeedItem =
    index === -1
      ? item
      : {
          ...item,
          createdAt: existing[index].createdAt,
          isRead: existing[index].isRead,
          isPinned: existing[index].isPinned,
          isDismissed: existing[index].isDismissed,
        };
  const updated =
    index === -1 ? [...existing, persisted] : existing.map((i, idx) => (idx === index ? persisted : i));
  writeFeedItems(updated);
  return persisted;
}

/**
 * Upserts a full generation batch and drops any previously persisted item
 * whose id wasn't regenerated this run — its underlying condition no longer
 * holds (e.g. a resolved Budget Warning gives way to a Budget Recovered item
 * with a different id). Mirrors how the Decision Engine's output fully
 * replaces the prior recommendation list on every run.
 */
export function reconcileFeedItems(items: FeedItem[]): FeedItem[] {
  const reconciled = items.map(upsertFeedItem);
  writeFeedItems(reconciled);
  return reconciled;
}

export function getAllFeedItems(): FeedItem[] {
  return readFeedItems();
}

export function getFeedItemById(id: string): FeedItem | undefined {
  return readFeedItems().find((i) => i.id === id);
}

export function getFeedItemsByType(type: FeedItemType): FeedItem[] {
  return readFeedItems().filter((i) => i.type === type);
}

export function getFeedItemsBySourceEngine(engine: FeedSourceEngine): FeedItem[] {
  return readFeedItems().filter((i) => i.sourceEngine === engine);
}

function updateFeedItem(
  id: string,
  patch: Partial<Pick<FeedItem, "isRead" | "isPinned" | "isDismissed">>,
): FeedItem | undefined {
  const items = readFeedItems();
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return undefined;
  const updated = { ...items[index], ...patch };
  writeFeedItems(items.map((i, idx) => (idx === index ? updated : i)));
  return updated;
}

export function markFeedItemRead(id: string): FeedItem | undefined {
  return updateFeedItem(id, { isRead: true });
}

export function markAllFeedItemsRead(): void {
  writeFeedItems(readFeedItems().map((i) => ({ ...i, isRead: true })));
}

export function pinFeedItem(id: string): FeedItem | undefined {
  return updateFeedItem(id, { isPinned: true });
}

export function unpinFeedItem(id: string): FeedItem | undefined {
  return updateFeedItem(id, { isPinned: false });
}

export function dismissFeedItem(id: string): FeedItem | undefined {
  return updateFeedItem(id, { isDismissed: true });
}

/** Un-dismisses a feed item — also the way an auto-expired ("archived") item is brought back. */
export function restoreFeedItem(id: string): FeedItem | undefined {
  return updateFeedItem(id, { isDismissed: false });
}

/**
 * Archives (dismisses without deleting) any item whose expiresAt has
 * passed, so stale time-bound items — an "upcoming renewal" for a renewal
 * that already happened — stop surfacing without losing their history.
 */
export function expireFeedItems(now: Date = new Date()): FeedItem[] {
  const items = readFeedItems();
  const nowIso = now.toISOString();
  const updated = items.map((i) =>
    i.expiresAt && i.expiresAt <= nowIso && !i.isDismissed ? { ...i, isDismissed: true } : i,
  );
  writeFeedItems(updated);
  return updated;
}

export function clearFeedItems(): void {
  writeFeedItems([]);
}
