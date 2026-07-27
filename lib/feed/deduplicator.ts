import type { FeedItem } from "@/types/feed";

function metadataString(item: FeedItem, key: string): string | undefined {
  const value = item.metadata[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Groups items that represent the same underlying situation even when they
 * were produced by different generator functions (or different upstream
 * source objects) — e.g. a Budget Engine-derived warning and an
 * Events-Engine-derived warning for the same category. Deterministic ids
 * already prevent a single generator from emitting true duplicates across
 * re-runs; this key catches the remaining cross-source overlaps named in
 * the spec (duplicate budget warnings per category, repeated forecast
 * updates, identical recommendation updates).
 */
function dedupeKey(item: FeedItem): string {
  const category = metadataString(item, "category");
  const merchant = metadataString(item, "merchant");

  switch (item.type) {
    case "budget-warning":
    case "budget-recovered":
      return `budget:${category ?? item.relatedObjectIds[0] ?? item.id}`;
    case "forecast-update":
    case "cash-flow-change":
      return "forecast";
    case "recommendation":
      return `recommendation:${item.relatedObjectIds[0] ?? item.id}`;
    case "new-subscription":
    case "subscription-renewal":
      return `${item.type}:${merchant ?? item.relatedObjectIds[0] ?? item.id}`;
    case "merchant-insight":
      return `merchant-insight:${merchant ?? item.relatedObjectIds[0] ?? item.id}`;
    case "category-trend":
      return `category-trend:${category ?? item.id}`;
    default:
      return item.id;
  }
}

/**
 * Deterministic, pure TypeScript — no React, no LLM. Collapses items that
 * share a dedupe key into a single representative: the highest-priority
 * item in the group, with every other member's relatedObjectIds merged in
 * so nothing referenced is lost. Instead of duplicate entries, the feed
 * ends up with one updated item.
 */
export function deduplicateFeedItems(items: FeedItem[]): FeedItem[] {
  const groups = new Map<string, FeedItem[]>();
  for (const item of items) {
    const key = dedupeKey(item);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const deduped: FeedItem[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      deduped.push(group[0]);
      continue;
    }
    const [primary, ...rest] = [...group].sort((a, b) => b.priority - a.priority);
    const mergedRelatedIds = Array.from(
      new Set([...primary.relatedObjectIds, ...rest.flatMap((i) => i.relatedObjectIds)]),
    );
    deduped.push({ ...primary, relatedObjectIds: mergedRelatedIds });
  }
  return deduped;
}
