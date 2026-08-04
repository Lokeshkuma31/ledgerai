// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  clearFeedItems,
  dismissFeedItem,
  expireFeedItems,
  getFeedItemById,
  getFeedItemsBySourceEngine,
  getFeedItemsByType,
  listFeedItems,
  markAllFeedItemsRead,
  markFeedItemRead,
  pinFeedItem,
  reconcileFeedItems,
  restoreFeedItem,
  unpinFeedItem,
  upsertFeedItem,
} from "@/services/feed/feed-service";
import type { FeedItem } from "@/types/feed";

let organizationId: string;

vi.setConfig({ testTimeout: 20000 });

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  const now = new Date().toISOString();
  return {
    id: "feed:budget:warning:food",
    type: "budget-warning",
    title: "Food budget at 85%",
    summary: "You've used 85% of your Food budget this month.",
    priority: 70,
    severity: "warning",
    sourceEngine: "budget",
    relatedObjectIds: [],
    explanationId: null,
    confidence: 1,
    createdAt: now,
    expiresAt: null,
    isRead: false,
    isPinned: false,
    isDismissed: false,
    metadata: { category: "Food" },
    ...overrides,
  };
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `feed-service-test-${Date.now()}@ledgerai.local`, name: "Feed Service Test" },
  });
  const organization = await prisma.organization.create({
    data: { name: "Feed Service Test Org", isPersonal: true },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
  });
  organizationId = organization.id;
}, 20000);

afterAll(async () => {
  await prisma.feedItem.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.feedItem.deleteMany({ where: { organizationId } });
});

describe("Feed service", () => {
  it("upsertFeedItem creates on first sight, then preserves createdAt/isRead/isPinned/isDismissed on regeneration", async () => {
    const first = await upsertFeedItem(organizationId, makeItem());
    await markFeedItemRead(organizationId, first.id);
    await pinFeedItem(organizationId, first.id);

    const regenerated = await upsertFeedItem(
      organizationId,
      makeItem({ title: "Food budget at 92%", priority: 85, createdAt: new Date().toISOString() }),
    );

    expect(regenerated.title).toBe("Food budget at 92%");
    expect(regenerated.priority).toBe(85);
    expect(regenerated.createdAt).toBe(first.createdAt);
    expect(regenerated.isRead).toBe(true);
    expect(regenerated.isPinned).toBe(true);
  });

  it("reconcileFeedItems deletes items not present in the new batch", async () => {
    await upsertFeedItem(organizationId, makeItem({ id: "feed:a" }));
    await upsertFeedItem(organizationId, makeItem({ id: "feed:b" }));

    await reconcileFeedItems(organizationId, [makeItem({ id: "feed:b" }), makeItem({ id: "feed:c" })]);

    const all = await listFeedItems(organizationId);
    expect(all.map((i) => i.id).sort()).toEqual(["feed:b", "feed:c"]);
  });

  it("getFeedItemsByType and getFeedItemsBySourceEngine scope correctly", async () => {
    await upsertFeedItem(organizationId, makeItem({ id: "feed:a", type: "budget-warning", sourceEngine: "budget" }));
    await upsertFeedItem(organizationId, makeItem({ id: "feed:b", type: "achievement", sourceEngine: "feed" }));

    expect(await getFeedItemsByType(organizationId, "budget-warning")).toHaveLength(1);
    expect(await getFeedItemsBySourceEngine(organizationId, "feed")).toHaveLength(1);
  });

  it("pin/unpin/dismiss/restore toggle their respective flags", async () => {
    const item = await upsertFeedItem(organizationId, makeItem());

    await pinFeedItem(organizationId, item.id);
    expect((await getFeedItemById(organizationId, item.id))?.isPinned).toBe(true);
    await unpinFeedItem(organizationId, item.id);
    expect((await getFeedItemById(organizationId, item.id))?.isPinned).toBe(false);

    await dismissFeedItem(organizationId, item.id);
    expect((await getFeedItemById(organizationId, item.id))?.isDismissed).toBe(true);
    await restoreFeedItem(organizationId, item.id);
    expect((await getFeedItemById(organizationId, item.id))?.isDismissed).toBe(false);
  });

  it("markAllFeedItemsRead marks every item for the organization", async () => {
    await upsertFeedItem(organizationId, makeItem({ id: "feed:a" }));
    await upsertFeedItem(organizationId, makeItem({ id: "feed:b" }));
    await markAllFeedItemsRead(organizationId);

    const all = await listFeedItems(organizationId);
    expect(all.every((i) => i.isRead)).toBe(true);
  });

  it("expireFeedItems dismisses items whose expiresAt has passed, and only those", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    await upsertFeedItem(organizationId, makeItem({ id: "feed:expired", expiresAt: past }));
    await upsertFeedItem(organizationId, makeItem({ id: "feed:active", expiresAt: future }));

    await expireFeedItems(organizationId);

    const all = await listFeedItems(organizationId);
    expect(all.find((i) => i.id === "feed:expired")?.isDismissed).toBe(true);
    expect(all.find((i) => i.id === "feed:active")?.isDismissed).toBe(false);
  });

  it("clearFeedItems wipes everything for the organization", async () => {
    await upsertFeedItem(organizationId, makeItem());
    await clearFeedItems(organizationId);
    expect(await listFeedItems(organizationId)).toHaveLength(0);
  });
});
