// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import * as connectionRepository from "@/repositories/connection-repository";
import type { StoredConnection } from "@/lib/connections/types";
import {
  collectConnectionCoachSummary,
  collectConnectionFeedItems,
  collectConnectionIndexObjects,
} from "@/services/feed/feed-contribution-service";

let userId: string;

vi.setConfig({ testTimeout: 20000 });

function makeConnection(overrides: Partial<StoredConnection> = {}): StoredConnection {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    userId,
    provider: "google",
    providerAccountId: "google-uid-1",
    displayName: "Person",
    email: "person@gmail.com",
    status: "connected",
    connectedAt: now,
    lastValidated: now,
    lastActivity: now,
    tokens: null,
    health: { status: "healthy", message: "OK", checkedAt: now },
    history: [{ type: "connected", at: now, message: "Connected." }],
    metadata: {},
    ...overrides,
  };
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `feed-contribution-service-test-${Date.now()}@ledgerai.local`, name: "Feed Contribution Test" },
  });
  userId = user.id;
}, 20000);

afterAll(async () => {
  await prisma.connection.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.connection.deleteMany({ where: { userId } });
});

describe("Feed Contribution service (pull model)", () => {
  it("collectConnectionFeedItems produces a 'connected' item from the most recent lifecycle event", async () => {
    const connection = makeConnection();
    await connectionRepository.upsertStoredConnection(connection);

    const items = await collectConnectionFeedItems(userId);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(`connection:${connection.id}:connected`);
    expect(items[0].title).toBe("Gmail connected");
    expect(items[0].severity).toBe("info");
  });

  it("uses the latest non-'renamed' event, matching lib/connections/engine.ts::lastLifecycleEvent", async () => {
    const now = new Date().toISOString();
    const connection = makeConnection({
      history: [
        { type: "connected", at: now, message: "Connected." },
        { type: "disconnected", at: now, message: "Disconnected." },
        { type: "renamed", at: now, message: "Renamed." },
      ],
    });
    await connectionRepository.upsertStoredConnection(connection);

    const items = await collectConnectionFeedItems(userId);
    expect(items[0].id).toBe(`connection:${connection.id}:disconnected`);
    expect(items[0].severity).toBe("warning");
  });

  it("collectConnectionIndexObjects builds a searchable index entry per connection", async () => {
    const connection = makeConnection({ provider: "microsoft", email: "person@outlook.com" });
    await connectionRepository.upsertStoredConnection(connection);

    const objects = await collectConnectionIndexObjects(userId);
    expect(objects).toHaveLength(1);
    expect(objects[0].id).toBe(`connection:${connection.id}`);
    expect(objects[0].title).toContain("Outlook");
    expect(objects[0].searchableText).toContain("person@outlook.com");
  });

  it("collectConnectionCoachSummary counts healthy vs needs-attention connections", async () => {
    const healthy = makeConnection();
    const unhealthy = makeConnection({
      id: crypto.randomUUID(),
      provider: "microsoft",
      providerAccountId: "ms-uid-1",
      status: "expired",
      health: { status: "expired-token", message: "Token expired", checkedAt: new Date().toISOString() },
    });
    await connectionRepository.upsertStoredConnection(healthy);
    await connectionRepository.upsertStoredConnection(unhealthy);

    const summary = await collectConnectionCoachSummary(userId);
    expect(summary?.pluginName).toBe("Connection Hub");
    expect(summary?.totalMessages).toBe(2);
    expect(summary?.importedCount).toBe(1);
    expect(summary?.failedCount).toBe(1);
  });

  it("collectConnectionCoachSummary returns null when there are no connections", async () => {
    expect(await collectConnectionCoachSummary(userId)).toBeNull();
  });
});
