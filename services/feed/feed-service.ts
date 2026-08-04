/**
 * Feed Service — the async, Postgres-backed successor to
 * lib/feed/registry.ts, following the repositories/+services/ split
 * established for every other domain.
 */
import * as feedRepository from "@/repositories/feed-repository";
import type { FeedItem, FeedItemType, FeedSourceEngine } from "@/types/feed";

export async function upsertFeedItem(organizationId: string, item: FeedItem): Promise<FeedItem> {
  return feedRepository.upsertFeedItem(organizationId, item);
}

export async function reconcileFeedItems(
  organizationId: string,
  items: FeedItem[],
): Promise<FeedItem[]> {
  return feedRepository.reconcileFeedItems(organizationId, items);
}

export async function listFeedItems(organizationId: string): Promise<FeedItem[]> {
  return feedRepository.getAllFeedItems(organizationId);
}

export async function getFeedItemById(
  organizationId: string,
  id: string,
): Promise<FeedItem | undefined> {
  return feedRepository.getFeedItemById(organizationId, id);
}

export async function getFeedItemsByType(
  organizationId: string,
  type: FeedItemType,
): Promise<FeedItem[]> {
  return feedRepository.getFeedItemsByType(organizationId, type);
}

export async function getFeedItemsBySourceEngine(
  organizationId: string,
  engine: FeedSourceEngine,
): Promise<FeedItem[]> {
  return feedRepository.getFeedItemsBySourceEngine(organizationId, engine);
}

export async function markFeedItemRead(
  organizationId: string,
  id: string,
): Promise<FeedItem | undefined> {
  return feedRepository.markFeedItemRead(organizationId, id);
}

export async function markAllFeedItemsRead(organizationId: string): Promise<void> {
  return feedRepository.markAllFeedItemsRead(organizationId);
}

export async function pinFeedItem(
  organizationId: string,
  id: string,
): Promise<FeedItem | undefined> {
  return feedRepository.pinFeedItem(organizationId, id);
}

export async function unpinFeedItem(
  organizationId: string,
  id: string,
): Promise<FeedItem | undefined> {
  return feedRepository.unpinFeedItem(organizationId, id);
}

export async function dismissFeedItem(
  organizationId: string,
  id: string,
): Promise<FeedItem | undefined> {
  return feedRepository.dismissFeedItem(organizationId, id);
}

export async function restoreFeedItem(
  organizationId: string,
  id: string,
): Promise<FeedItem | undefined> {
  return feedRepository.restoreFeedItem(organizationId, id);
}

export async function expireFeedItems(
  organizationId: string,
  now: Date = new Date(),
): Promise<void> {
  return feedRepository.expireFeedItems(organizationId, now);
}

export async function clearFeedItems(organizationId: string): Promise<void> {
  return feedRepository.clearFeedItems(organizationId);
}
