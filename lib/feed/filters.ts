import type { FeedFilterOptions, FeedItem } from "@/types/feed";

function metadataString(item: FeedItem, key: string): string | undefined {
  const value = item.metadata[key];
  return typeof value === "string" ? value : undefined;
}

function matchesText(value: string | undefined, needle: string): boolean {
  return value !== undefined && value.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Pure predicate-based filtering over an already-generated feed — never
 * fetches or mutates anything. Kept independent from lib/feed/registry.ts
 * so a UI can filter any FeedItem[] (persisted or in-memory) the same way.
 */
export function filterFeedItems(items: FeedItem[], options: FeedFilterOptions = {}): FeedItem[] {
  return items.filter((item) => {
    if (options.priorityMin !== undefined && item.priority < options.priorityMin) return false;
    if (options.severities && !options.severities.includes(item.severity)) return false;
    if (options.sourceEngines && !options.sourceEngines.includes(item.sourceEngine)) return false;
    if (options.merchant && !matchesText(metadataString(item, "merchant"), options.merchant)) return false;
    if (options.category && !matchesText(metadataString(item, "category"), options.category)) return false;
    if (options.unreadOnly && item.isRead) return false;
    if (options.pinnedOnly && !item.isPinned) return false;

    const createdDate = item.createdAt.slice(0, 10);
    if (options.startDate && createdDate < options.startDate) return false;
    if (options.endDate && createdDate > options.endDate) return false;

    return true;
  });
}
