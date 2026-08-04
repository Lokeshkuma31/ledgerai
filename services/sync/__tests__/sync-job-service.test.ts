// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  clearSyncHistory,
  getLatestSyncJob,
  getSyncJobById,
  getSyncJobsByProvider,
  listSyncJobs,
  recordSyncJob,
} from "@/services/sync/sync-job-service";
import type { SyncJob } from "@/lib/sync/types";

let organizationId: string;

vi.setConfig({ testTimeout: 20000 });

function makeJob(overrides: Partial<SyncJob> = {}): SyncJob {
  return {
    id: crypto.randomUUID(),
    provider: "hdfc-001",
    plugin: "HDFC Bank",
    type: "manual",
    status: "queued",
    startedAt: null,
    completedAt: null,
    duration: null,
    itemsDiscovered: 0,
    itemsImported: 0,
    itemsSkipped: 0,
    duplicates: 0,
    errors: [],
    warnings: [],
    retryCount: 0,
    lastCheckpoint: null,
    metadata: {},
    queuedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `sync-job-service-test-${Date.now()}@ledgerai.local`, name: "Sync Job Service Test" },
  });
  const organization = await prisma.organization.create({
    data: { name: "Sync Job Service Test Org", isPersonal: true },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
  });
  organizationId = organization.id;
}, 20000);

afterAll(async () => {
  await prisma.syncJob.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.syncJob.deleteMany({ where: { organizationId } });
});

describe("Sync Job service", () => {
  it("records a queued job and re-recording the same id transitions it in place rather than duplicating", async () => {
    const job = makeJob();
    await recordSyncJob(organizationId, job, "bank");

    const startedAt = new Date().toISOString();
    await recordSyncJob(organizationId, { ...job, status: "running", startedAt }, "bank");

    const all = await listSyncJobs(organizationId);
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("running");
    expect(all[0].startedAt).toBe(startedAt);
  });

  it("computes duration from startedAt/completedAt at read time", async () => {
    const startedAt = new Date("2026-08-01T10:00:00.000Z").toISOString();
    const completedAt = new Date("2026-08-01T10:00:05.000Z").toISOString();
    const job = makeJob({ status: "completed", startedAt, completedAt, itemsImported: 5 });
    await recordSyncJob(organizationId, job, "bank");

    const found = await getSyncJobById(organizationId, job.id);
    expect(found?.duration).toBe(5000);
    expect(found?.itemsImported).toBe(5);
  });

  it("getSyncJobsByProvider and getLatestSyncJob scope correctly", async () => {
    const older = makeJob({
      provider: "hdfc-001",
      status: "completed",
      startedAt: "2026-08-01T00:00:00.000Z",
      completedAt: "2026-08-01T00:01:00.000Z",
    });
    const newer = makeJob({
      provider: "hdfc-001",
      status: "completed",
      startedAt: "2026-08-02T00:00:00.000Z",
      completedAt: "2026-08-02T00:01:00.000Z",
    });
    const otherProvider = makeJob({ provider: "gmail-account", status: "completed", startedAt: "2026-08-03T00:00:00.000Z" });

    await recordSyncJob(organizationId, older, "bank");
    await recordSyncJob(organizationId, newer, "bank");
    await recordSyncJob(organizationId, otherProvider, "email");

    const forHdfc = await getSyncJobsByProvider(organizationId, "hdfc-001");
    expect(forHdfc).toHaveLength(2);

    const latest = await getLatestSyncJob(organizationId, "hdfc-001");
    expect(latest?.id).toBe(newer.id);
  });

  it("preserves errors/warnings/metadata JSON round-trip", async () => {
    const job = makeJob({
      errors: [{ message: "Rate limited", at: new Date().toISOString() }],
      warnings: [{ message: "Partial batch", at: new Date().toISOString() }],
      metadata: { transactionsUpdated: 3 },
      lastCheckpoint: "cursor-abc-123",
    });
    await recordSyncJob(organizationId, job, "sms");

    const found = await getSyncJobById(organizationId, job.id);
    expect(found?.errors).toEqual(job.errors);
    expect(found?.warnings).toEqual(job.warnings);
    expect(found?.metadata).toEqual({ transactionsUpdated: 3 });
    expect(found?.lastCheckpoint).toBe("cursor-abc-123");
  });

  it("clearSyncHistory removes everything for the organization", async () => {
    await recordSyncJob(organizationId, makeJob(), "document");
    await clearSyncHistory(organizationId);
    expect(await listSyncJobs(organizationId)).toHaveLength(0);
  });
});
