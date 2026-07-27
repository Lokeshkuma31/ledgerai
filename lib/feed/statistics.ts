import type { FeedItem, FeedItemType, FeedStatistics } from "@/types/feed";

function distinctDayCount(items: FeedItem[]): number {
  const days = new Set(items.map((i) => i.createdAt.slice(0, 10)));
  return Math.max(1, days.size);
}

/**
 * Deterministic aggregate stats over an already-generated feed. "Active"
 * (non-dismissed) items drive unread/critical/average/most-common/highest —
 * a dismissed item shouldn't inflate how urgent or noisy the current feed
 * looks — while dismissedCount and pinnedCount look at the full set.
 */
export function computeFeedStatistics(items: FeedItem[]): FeedStatistics {
  const active = items.filter((i) => !i.isDismissed);
  const dismissedCount = items.length - active.length;
  const unreadCount = active.filter((i) => !i.isRead).length;
  const criticalCount = active.filter((i) => i.severity === "critical").length;
  const pinnedCount = items.filter((i) => i.isPinned).length;

  const typeCounts = new Map<FeedItemType, number>();
  for (const item of active) {
    typeCounts.set(item.type, (typeCounts.get(item.type) ?? 0) + 1);
  }
  let mostCommonType: FeedItemType | null = null;
  let mostCommonCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > mostCommonCount) {
      mostCommonType = type;
      mostCommonCount = count;
    }
  }

  const highestPriorityItem =
    active.length === 0 ? null : active.reduce((max, i) => (i.priority > max.priority ? i : max));

  return {
    unreadCount,
    criticalCount,
    dismissedCount,
    pinnedCount,
    averageDailyInsights:
      active.length === 0 ? 0 : Math.round((active.length / distinctDayCount(active)) * 100) / 100,
    mostCommonType,
    highestPriorityItem,
  };
}
