// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  clearMemory,
  findRememberedCategory,
  forgetCategory,
  getMemoryEntries,
  learnCategory,
} from "@/services/ai-memory/ai-memory-service";

let organizationId: string;

vi.setConfig({ testTimeout: 20000 });

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `ai-memory-service-test-${Date.now()}@ledgerai.local`, name: "AI Memory Service Test" },
  });
  const organization = await prisma.organization.create({
    data: { name: "AI Memory Service Test Org", isPersonal: true },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
  });
  organizationId = organization.id;
}, 20000);

afterAll(async () => {
  await prisma.aIMemoryEntry.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.aIMemoryEntry.deleteMany({ where: { organizationId } });
});

describe("AI Memory service", () => {
  it("learnCategory then findRememberedCategory round-trips, case/whitespace-insensitively", async () => {
    await learnCategory(organizationId, "  Swiggy   Order ", "Food");
    expect(await findRememberedCategory(organizationId, "swiggy order")).toBe("Food");
    expect(await findRememberedCategory(organizationId, "SWIGGY ORDER")).toBe("Food");
  });

  it("findRememberedCategory returns null for an unknown note", async () => {
    expect(await findRememberedCategory(organizationId, "Some random note")).toBeNull();
  });

  it("learnCategory overwrites the category for the same normalized note", async () => {
    await learnCategory(organizationId, "Uber ride", "Transport");
    await learnCategory(organizationId, "Uber ride", "Travel");
    expect(await findRememberedCategory(organizationId, "uber ride")).toBe("Travel");
  });

  it("a blank note is a no-op", async () => {
    await learnCategory(organizationId, "   ", "Food");
    expect(await getMemoryEntries(organizationId)).toHaveLength(0);
  });

  it("getMemoryEntries returns entries sorted by note", async () => {
    await learnCategory(organizationId, "Zomato order", "Food");
    await learnCategory(organizationId, "Amazon purchase", "Shopping");

    const entries = await getMemoryEntries(organizationId);
    expect(entries.map((e) => e.note)).toEqual(["Amazon purchase", "Zomato order"]);
  });

  it("forgetCategory removes a single entry", async () => {
    await learnCategory(organizationId, "Netflix", "Entertainment");
    const [entry] = await getMemoryEntries(organizationId);

    await forgetCategory(organizationId, entry.key);
    expect(await getMemoryEntries(organizationId)).toHaveLength(0);
  });

  it("clearMemory wipes everything for the organization", async () => {
    await learnCategory(organizationId, "Netflix", "Entertainment");
    await learnCategory(organizationId, "Spotify", "Entertainment");
    await clearMemory(organizationId);
    expect(await getMemoryEntries(organizationId)).toHaveLength(0);
  });
});
