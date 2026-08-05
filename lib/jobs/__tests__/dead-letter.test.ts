// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";

// Only the outbound Inngest send is mocked (true external I/O) — JobRun/
// JobDeadLetter writes go through the real dev database, matching this
// repo's testing convention (see lib/auth/__tests__/session.test.ts).
const sendMock = vi.fn(async (..._args: unknown[]) => ({ ids: ["evt_retry_1"] }));
vi.mock("@/lib/jobs/engine", () => ({
  inngest: { send: (payload: unknown) => sendMock(payload) },
  JOB_PLATFORM_APP_ID: "ledgerai",
}));

const { routeToDeadLetter, retryDeadLetter } = await import("@/lib/jobs/dead-letter");
const jobService = await import("@/services/jobs/job-service");

vi.setConfig({ testTimeout: 20000 });

let organizationId: string;

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { name: `Dead Letter Test Org ${Date.now()}`, isPersonal: true },
  });
  organizationId = organization.id;
});

afterAll(async () => {
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  sendMock.mockClear();
});

describe("routeToDeadLetter", () => {
  it("creates a JobDeadLetter row and flips the JobRun to DEAD_LETTER", async () => {
    const key = { jobType: "test-job", inngestEventId: `evt_${Date.now()}_route` };
    const run = await jobService.createQueued({
      ...key,
      eventName: "ledger/sync.started",
      organizationId,
      correlationId: "corr_route",
    });
    await jobService.markRunning(key, "run_1", 0);
    await jobService.markFailed(key, { message: "permanent" }, 4);

    await routeToDeadLetter({
      jobRunId: run.id,
      jobType: key.jobType,
      organizationId,
      eventPayload: { id: key.inngestEventId, name: "ledger/sync.started", data: { organizationId } },
      error: { message: "permanent" },
      originalRunId: "inngest_run_xyz",
    });

    const updated = await jobService.getRunById(run.id);
    expect(updated?.status).toBe("DEAD_LETTER");

    const entries = await jobService.listDeadLetters({ organizationId, includeResolved: true });
    expect(entries.some((e) => e.jobRunId === run.id)).toBe(true);
  });
});

describe("retryDeadLetter", () => {
  it("re-dispatches the original event with a fresh id and resolves the entry", async () => {
    const key = { jobType: "test-job", inngestEventId: `evt_${Date.now()}_retry` };
    const run = await jobService.createQueued({
      ...key,
      eventName: "ledger/sync.started",
      organizationId,
      correlationId: "corr_retry",
    });
    await jobService.markFailed(key, { message: "permanent" }, 4);

    await routeToDeadLetter({
      jobRunId: run.id,
      jobType: key.jobType,
      organizationId,
      eventPayload: { id: key.inngestEventId, name: "ledger/sync.started", data: { organizationId, providerId: "gmail", providerCategory: "email", runType: "manual" } },
      error: { message: "permanent" },
      originalRunId: "inngest_run_xyz",
    });

    const [entry] = await jobService.listDeadLetters({ organizationId, includeResolved: false });
    expect(entry).toBeDefined();

    await retryDeadLetter(entry.id, "admin_user_1");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0] as { id?: string; data: { retryOf?: string } };
    expect(sent.id).not.toBe(key.inngestEventId); // fresh id — the original would just be deduped away
    expect(sent.data.retryOf).toBe(entry.id);

    const resolved = await jobService.getDeadLetterById(entry.id);
    expect(resolved?.resolvedAt).not.toBeNull();
    expect(resolved?.resolvedBy).toBe("admin_user_1");
  });

  it("throws for an unknown dead-letter id rather than silently no-oping", async () => {
    await expect(retryDeadLetter("does-not-exist", "admin_user_1")).rejects.toThrow();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
