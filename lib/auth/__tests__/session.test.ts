// @vitest-environment node
//
// Postgres-backed via the Neon serverless driver — same jsdom-conflict
// reason every other Postgres-integration suite in this repo overrides
// back to the plain Node environment (see lib/connections/__tests__/engine.test.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";

// The only thing mocked: Better Auth's own session-cookie resolution —
// everything downstream (the Membership/Organization query) runs against
// the real dev database, matching this repo's "mock only true external
// I/O" testing convention.
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth/better-auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const { auth } = await import("@/lib/auth/better-auth");
const { getCurrentMembership, getCurrentOrganizationId, getCurrentUserId } = await import("@/lib/auth/session");

vi.setConfig({ testTimeout: 20000 });

let userId: string;
let organizationId: string;

function mockSignedInAs(id: string) {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id, email: "test@ledgerai.local", name: "Test User", emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
    session: { id: "sess-1", userId: id, token: "tok", expiresAt: new Date(Date.now() + 3600_000), createdAt: new Date(), updatedAt: new Date() },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `session-test-${Date.now()}@ledgerai.local`, name: "Session Test" },
  });
  const organization = await prisma.organization.create({ data: { name: "Session Test Org", isPersonal: true } });
  await prisma.membership.create({ data: { userId: user.id, organizationId: organization.id, role: "ADMIN" } });
  userId = user.id;
  organizationId = organization.id;
}, 20000);

afterAll(async () => {
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.mocked(auth.api.getSession).mockReset();
});

describe("getCurrentUserId / getCurrentOrganizationId / getCurrentMembership", () => {
  it("returns null for everything when there's no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    expect(await getCurrentUserId()).toBeNull();
    expect(await getCurrentOrganizationId()).toBeNull();
    expect(await getCurrentMembership()).toBeNull();
  });

  it("resolves the real userId from a mocked session", async () => {
    mockSignedInAs(userId);
    expect(await getCurrentUserId()).toBe(userId);
  });

  it("getCurrentMembership resolves organizationId, organizationName, and role from Postgres", async () => {
    mockSignedInAs(userId);
    const membership = await getCurrentMembership();
    expect(membership).toEqual({
      organizationId,
      organizationName: "Session Test Org",
      role: "ADMIN",
    });
  });

  it("getCurrentOrganizationId is consistent with getCurrentMembership", async () => {
    mockSignedInAs(userId);
    expect(await getCurrentOrganizationId()).toBe(organizationId);
  });

  it("returns null when the signed-in user has no membership", async () => {
    const orphanUser = await prisma.user.create({
      data: { email: `orphan-${Date.now()}@ledgerai.local`, name: "Orphan" },
    });
    mockSignedInAs(orphanUser.id);
    expect(await getCurrentMembership()).toBeNull();
    await prisma.user.delete({ where: { id: orphanUser.id } });
  });
});
