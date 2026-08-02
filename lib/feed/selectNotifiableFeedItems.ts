import type { FeedItem } from "@/types/feed";
import type { NotificationCandidate } from "@/types/policy";

/**
 * The first real consumer that turns the Automation & Notification Policy
 * Engine's decisions into actual delivery. Every other part of the app
 * treats `NotificationCandidate`s as recommendations only — the engine's
 * own settings-page copy states "nothing here is actually sent." This
 * selects exactly the feed items whose matching candidate was decided
 * "notify-immediately", ranked by priority — the set the Notification
 * Center's bell dropdown surfaces.
 *
 * Pure function, no storage access — the hook that wraps this
 * (lib/feed/useNotificationCenter.ts) supplies already-loaded FinancialState
 * data and stays a thin pass-through.
 */
export function selectNotifiableFeedItems(
  feedItems: FeedItem[],
  notificationCandidates: NotificationCandidate[],
  limit = 20,
): FeedItem[] {
  const notifiableIds = new Set(
    notificationCandidates
      .filter((candidate) => candidate.policyDecision === "notify-immediately")
      .map((candidate) => candidate.metadata.feedItemId)
      .filter((id): id is string => typeof id === "string"),
  );

  return feedItems
    .filter((item) => !item.isDismissed && notifiableIds.has(item.id))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}
