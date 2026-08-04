// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  archiveCandidate,
  clearCandidates,
  clearCooldowns,
  expireCandidates,
  getAuditTrail,
  getCandidateById,
  getCandidatesByDecision,
  getPreferences,
  isSuppressedByCooldown,
  listCandidates,
  overrideDecision,
  recordFiring,
  reconcileCandidates,
  resetPreferences,
  restoreDecision,
  updatePreferences,
  upsertCandidate,
} from "@/services/policy/notification-service";
import type { NotificationCandidate } from "@/types/policy";

let organizationId: string;

vi.setConfig({ testTimeout: 20000 });

function makeCandidate(overrides: Partial<NotificationCandidate> = {}): NotificationCandidate {
  const now = new Date().toISOString();
  return {
    id: "policy:budget:food",
    title: "Food budget at 85%",
    summary: "You've used 85% of your Food budget this month.",
    priority: 70,
    severity: "warning",
    reason: "Budget usage crossed 80%.",
    sourceEngine: "budget",
    relatedObjectIds: [],
    recommendedChannels: ["dashboard-feed", "push"],
    recommendedTime: now,
    expiresAt: null,
    cooldownKey: "budget:Food",
    confidence: 1,
    policyDecision: "notify-immediately",
    metadata: {},
    createdAt: now,
    ...overrides,
  };
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `notification-service-test-${Date.now()}@ledgerai.local`, name: "Notification Service Test" },
  });
  const organization = await prisma.organization.create({
    data: { name: "Notification Service Test Org", isPersonal: true },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
  });
  organizationId = organization.id;
}, 20000);

afterAll(async () => {
  await prisma.notificationCandidate.deleteMany({ where: { organizationId } });
  await prisma.notificationPreferences.deleteMany({ where: { organizationId } });
  await prisma.notificationCooldown.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.notificationCandidate.deleteMany({ where: { organizationId } });
  await prisma.notificationPreferences.deleteMany({ where: { organizationId } });
  await prisma.notificationCooldown.deleteMany({ where: { organizationId } });
});

describe("Notification service — candidates", () => {
  it("upsertCandidate creates on first sight, preserving createdAt on regeneration", async () => {
    const first = await upsertCandidate(organizationId, makeCandidate());
    const regenerated = await upsertCandidate(
      organizationId,
      makeCandidate({ title: "Food budget at 95%", priority: 90, createdAt: new Date().toISOString() }),
    );
    expect(regenerated.title).toBe("Food budget at 95%");
    expect(regenerated.createdAt).toBe(first.createdAt);
  });

  it("a manual override survives regeneration and reports the original decision", async () => {
    await upsertCandidate(organizationId, makeCandidate({ policyDecision: "notify-immediately" }));
    await overrideDecision(organizationId, "policy:budget:food", "silent");

    const regenerated = await upsertCandidate(
      organizationId,
      makeCandidate({ policyDecision: "notify-immediately", createdAt: new Date().toISOString() }),
    );
    expect(regenerated.policyDecision).toBe("silent");
    expect(regenerated.metadata.overriddenDecision).toBe("silent");
    expect(regenerated.metadata.originalDecision).toBe("notify-immediately");
  });

  it("restoreDecision clears the override and lets the fresh decision take effect again", async () => {
    await upsertCandidate(organizationId, makeCandidate({ policyDecision: "notify-immediately" }));
    await overrideDecision(organizationId, "policy:budget:food", "silent");
    await restoreDecision(organizationId, "policy:budget:food");

    const regenerated = await upsertCandidate(
      organizationId,
      makeCandidate({ policyDecision: "schedule-later", createdAt: new Date().toISOString() }),
    );
    expect(regenerated.policyDecision).toBe("schedule-later");
    expect(regenerated.metadata.overriddenDecision).toBeUndefined();
  });

  it("archiveCandidate overrides to dismiss", async () => {
    await upsertCandidate(organizationId, makeCandidate());
    const archived = await archiveCandidate(organizationId, "policy:budget:food");
    expect(archived?.policyDecision).toBe("dismiss");
  });

  it("reconcileCandidates deletes candidates not present in the new batch", async () => {
    await upsertCandidate(organizationId, makeCandidate({ id: "policy:a" }));
    await upsertCandidate(organizationId, makeCandidate({ id: "policy:b" }));

    await reconcileCandidates(organizationId, [makeCandidate({ id: "policy:b" }), makeCandidate({ id: "policy:c" })]);

    const all = await listCandidates(organizationId);
    expect(all.map((c) => c.id).sort()).toEqual(["policy:b", "policy:c"]);
  });

  it("getCandidatesByDecision and getAuditTrail (newest first) work", async () => {
    await upsertCandidate(organizationId, makeCandidate({ id: "policy:a", policyDecision: "silent", createdAt: "2026-08-01T00:00:00.000Z" }));
    await upsertCandidate(organizationId, makeCandidate({ id: "policy:b", policyDecision: "notify-immediately", createdAt: "2026-08-02T00:00:00.000Z" }));

    expect(await getCandidatesByDecision(organizationId, "silent")).toHaveLength(1);
    const trail = await getAuditTrail(organizationId);
    expect(trail[0].id).toBe("policy:b");
  });

  it("expireCandidates marks passed-expiry candidates as expired", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await upsertCandidate(organizationId, makeCandidate({ id: "policy:expired", expiresAt: past }));
    await expireCandidates(organizationId);

    const candidate = await getCandidateById(organizationId, "policy:expired");
    expect(candidate?.policyDecision).toBe("expired");
  });

  it("clearCandidates wipes everything for the organization", async () => {
    await upsertCandidate(organizationId, makeCandidate());
    await clearCandidates(organizationId);
    expect(await listCandidates(organizationId)).toHaveLength(0);
  });
});

describe("Notification service — preferences", () => {
  it("getPreferences falls back to defaults when nothing is persisted", async () => {
    const prefs = await getPreferences(organizationId);
    expect(prefs.budgetAlerts).toBe(true);
    expect(prefs.maxNotificationsPerDay).toBe(10);
  });

  it("updatePreferences merges the patch, including a partial quietHours", async () => {
    await updatePreferences(organizationId, { budgetAlerts: false, quietHours: { enabled: true, start: "23:00", end: "06:00" } });
    const updated = await getPreferences(organizationId);
    expect(updated.budgetAlerts).toBe(false);
    expect(updated.quietHours).toEqual({ enabled: true, start: "23:00", end: "06:00" });
    expect(updated.forecastAlerts).toBe(true);
  });

  it("resetPreferences restores defaults", async () => {
    await updatePreferences(organizationId, { budgetAlerts: false });
    await resetPreferences(organizationId);
    expect((await getPreferences(organizationId)).budgetAlerts).toBe(true);
  });
});

describe("Notification service — cooldown", () => {
  it("isSuppressedByCooldown is false with no prior firing, then true within the window", async () => {
    const now = new Date();
    expect(await isSuppressedByCooldown(organizationId, "budget:Food", "sig-1", 60_000, now)).toBe(false);

    await recordFiring(organizationId, "budget:Food", "sig-1", now);
    const soonAfter = new Date(now.getTime() + 1000);
    expect(await isSuppressedByCooldown(organizationId, "budget:Food", "sig-2", 60_000, soonAfter)).toBe(true);
  });

  it("isSuppressedByCooldown is true when content is unchanged, even outside the window", async () => {
    const now = new Date();
    await recordFiring(organizationId, "budget:Food", "sig-1", now);
    const wayAfter = new Date(now.getTime() + 10 * 60_000);
    expect(await isSuppressedByCooldown(organizationId, "budget:Food", "sig-1", 60_000, wayAfter)).toBe(true);
  });

  it("clearCooldowns wipes everything for the organization", async () => {
    await recordFiring(organizationId, "budget:Food", "sig-1", new Date());
    await clearCooldowns(organizationId);
    expect(await isSuppressedByCooldown(organizationId, "budget:Food", "sig-1", 60_000, new Date())).toBe(false);
  });
});
