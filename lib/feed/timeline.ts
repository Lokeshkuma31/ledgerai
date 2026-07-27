import type { FeedItem, FeedTimelineBucketKey, FeedTimelineGroup } from "@/types/feed";

const GROUP_ORDER: { key: FeedTimelineBucketKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "earlier", label: "Earlier" },
];

function daysSince(dateIso: string, today: Date): number {
  const date = new Date(dateIso);
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((today.getTime() - localDate.getTime()) / msPerDay);
}

/**
 * Buckets are mutually exclusive and checked in this order, mirroring
 * lib/timeline/engine.ts's classify() — a date is never double-counted.
 */
function classify(createdAt: string, today: Date): FeedTimelineBucketKey {
  const diff = daysSince(createdAt, today);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff <= 7) return "thisWeek";
  return "earlier";
}

/**
 * Pure, deterministic grouping of already-prioritized feed items into
 * Today / Yesterday / This Week / Earlier buckets by createdAt. No React,
 * no storage access — a display-shaping step over data the engine already produced.
 */
export function groupFeedItemsByTimeline(items: FeedItem[], now: Date = new Date()): FeedTimelineGroup[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const buckets = new Map<FeedTimelineBucketKey, FeedItem[]>();
  for (const item of items) {
    const key = classify(item.createdAt, today);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  return GROUP_ORDER.filter(({ key }) => buckets.has(key)).map(({ key, label }) => ({
    key,
    label,
    items: buckets.get(key)!,
  }));
}
