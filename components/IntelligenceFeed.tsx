"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import FeedFilters, {
  emptyFeedFilterState,
  toFeedFilterOptions,
  type FeedFilterState,
} from "@/components/FeedFilters";
import FeedStatistics from "@/components/FeedStatistics";
import FeedTimeline from "@/components/FeedTimeline";
import { filterFeedItems } from "@/lib/feed/filters";
import { dismissFeedItem, markFeedItemRead, pinFeedItem, unpinFeedItem } from "@/lib/feed/registry";
import { computeFeedStatistics } from "@/lib/feed/statistics";
import { groupFeedItemsByTimeline } from "@/lib/feed/timeline";
import type { ExplanationContext } from "@/types/explanation";
import type { FeedItem } from "@/types/feed";

/**
 * The unified Financial Intelligence Feed — replaces the dashboard's
 * separate Financial Events and Recommendations sections with one
 * prioritized, filterable timeline. Reads exclusively from the FeedItem[]
 * the orchestrator already produced; every mutation (dismiss/pin/mark
 * read) goes through lib/feed/registry.ts and then asks the caller to
 * rebuild FinancialState, mirroring how the rest of the dashboard mutates
 * through storage helpers rather than touching an engine directly.
 */
export default function IntelligenceFeed({
  items,
  now = new Date(),
  explanationContext,
  onChange,
}: {
  items: FeedItem[];
  now?: Date;
  explanationContext?: ExplanationContext;
  onChange: () => void;
}) {
  const [filterState, setFilterState] = useState<FeedFilterState>(emptyFeedFilterState());

  const statistics = useMemo(() => computeFeedStatistics(items), [items]);

  const visible = useMemo(() => {
    const active = items.filter((item) => !item.isDismissed);
    return filterFeedItems(active, toFeedFilterOptions(filterState, now));
  }, [items, filterState, now]);

  const groups = useMemo(() => groupFeedItemsByTimeline(visible, now), [visible, now]);

  function handleDismiss(item: FeedItem) {
    dismissFeedItem(item.id);
    onChange();
  }

  function handlePin(item: FeedItem) {
    if (item.isPinned) unpinFeedItem(item.id);
    else pinFeedItem(item.id);
    onChange();
  }

  function handleMarkRead(item: FeedItem) {
    markFeedItemRead(item.id);
    onChange();
  }

  return (
    <div className="flex flex-col gap-4">
      <FeedStatistics statistics={statistics} />
      <FeedFilters state={filterState} onChange={setFilterState} />
      {groups.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">No feed items match these filters.</p>
          </CardContent>
        </Card>
      ) : (
        <FeedTimeline
          groups={groups}
          now={now}
          explanationContext={explanationContext}
          onDismiss={handleDismiss}
          onPin={handlePin}
          onMarkRead={handleMarkRead}
        />
      )}
    </div>
  );
}
