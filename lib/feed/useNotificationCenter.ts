"use client";

import { useMemo } from "react";
import { useDashboard } from "@/components/DashboardProvider";
import { dismissFeedItem, markFeedItemRead, pinFeedItem, unpinFeedItem } from "@/lib/feed/registry";
import { selectNotifiableFeedItems } from "@/lib/feed/selectNotifiableFeedItems";
import type { FeedItem } from "@/types/feed";

/**
 * Thin wrapper around the already-computed FinancialState — the pure
 * selection logic lives in selectNotifiableFeedItems.ts (unit-tested
 * directly); this hook only supplies state.feed/state.notificationCandidates
 * and the same dismiss/pin/markRead mutation pattern IntelligenceFeed.tsx
 * already uses for the full /feed page, so both surfaces mutate through
 * lib/feed/registry.ts identically.
 */
export function useNotificationCenter() {
  const { state, refresh } = useDashboard();

  const items = useMemo(() => {
    if (!state) return [];
    return selectNotifiableFeedItems(state.feed, state.notificationCandidates);
  }, [state]);

  const unreadCount = items.filter((item) => !item.isRead).length;

  function dismiss(item: FeedItem) {
    dismissFeedItem(item.id);
    refresh();
  }

  function togglePin(item: FeedItem) {
    if (item.isPinned) unpinFeedItem(item.id);
    else pinFeedItem(item.id);
    refresh();
  }

  function markRead(item: FeedItem) {
    markFeedItemRead(item.id);
    refresh();
  }

  return { items, unreadCount, dismiss, togglePin, markRead, isLoading: !state };
}
