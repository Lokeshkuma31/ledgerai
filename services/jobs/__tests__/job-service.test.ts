// @vitest-environment node
//
// Postgres-backed via the Neon serverless driver — same jsdom-conflict
// reason every other Postgres-integration suite in this repo overrides
// back to the plain Node environment (see lib/connections/__tests__/engine.test.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import * as jobService from "@/services/jobs/job-service";

vi.setConfig({ testTimeout: 20000 });

let organizationId: string;

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { name: `Job Service Test Org ${Date.now()}`, isPersonal: true },
  });
  organizationId = organization.id;
});

afterAll(async () => {
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.jobDeadLetter.deleteMany({ where: { organizationId } });
  await prisma.jobRun.deleteMany({ where: { organizationId } });
});

describe("job lifecycle", () => {
  it("goes queued -> running -> completed, recording duration and progress", async () => {
    const key = { jobType: "test-job", inngestEventId: `evt_${Date.now()}_1` };

    const queued = await jobService.createQueued({
      ...key,
      eventName: "ledger/transaction.created",
      organizationId,
      correlationId: "corr_1",
      input: { transactionId: "tx_1" },
    });
    expect(queued.status).toBe("QUEUED");

    const running = await jobService.markRunning(key, "run_1", 0);
    expect(running.status).toBe("RUNNING");
    expect(running.startedAt).not.toBeNull();

    await jobService.setProgress(key, 50);

    const completed = await jobService.markCompleted(key, { classified: true });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.progress).toBe(100);
    expect(completed.completedAt).not.toBeNull();
    expect(completed.durationMs).not.toBeNull();
    expect(completed.output).toEqual({ classified: true });
  });

  it("goes queued -> running -> retrying -> failed on repeated transient failure", async () => {
    const key = { jobType: "test-job", inngestEventId: `evt_${Date.now()}_2` };
    await jobService.createQueued({ ...key, eventName: "ledger/sync.started", organizationId, correlationId: "corr_2" });
    await jobService.markRunning(key, "run_2", 0);

    const retrying = await jobService.markRetrying(key, 1, { message: "transient blip" });
    expect(retrying.status).toBe("RETRYING");
    expect(retrying.attempt).toBe(1);

    const failed = await jobService.markFailed(key, { message: "gave up" }, 4);
    expect(failed.status).toBe("FAILED");
    expect(failed.attempt).toBe(4);
    expect(failed.completedAt).not.toBeNull();
  });

  it("supports cancellation from any in-flight state", async () => {
    const key = { jobType: "test-job", inngestEventId: `evt_${Date.now()}_3` };
    await jobService.createQueued({ ...key, eventName: "ledger/sync.started", organizationId, correlationId: "corr_3" });
    await jobService.markRunning(key, "run_3", 0);

    const cancelled = await jobService.markCancelled(key);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.completedAt).not.toBeNull();
  });
});

describe("idempotency / duplicate event handling", () => {
  it("upserts on (jobType, inngestEventId) — redispatching the same event id converges to one row", async () => {
    const key = { jobType: "test-job", inngestEventId: `evt_${Date.now()}_dup` };

    const first = await jobService.createQueued({
      ...key,
      eventName: "ledger/transaction.created",
      organizationId,
      correlationId: "corr_dup",
      input: { attempt: "first" },
    });
    const second = await jobService.createQueued({
      ...key,
      eventName: "ledger/transaction.created",
      organizationId,
      correlationId: "corr_dup",
      input: { attempt: "second" },
    });

    expect(second.id).toBe(first.id); // same row, not a duplicate
    const rows = await prisma.jobRun.findMany({ where: { inngestEventId: key.inngestEventId } });
    expect(rows).toHaveLength(1);
  });

  it("allows two different functions to each track their own row for the same event id (fan-out)", async () => {
    const inngestEventId = `evt_${Date.now()}_fanout`;
    await jobService.createQueued({
      jobType: "workflow-execute",
      inngestEventId,
      eventName: "ledger/transaction.classified",
      organizationId,
      correlationId: "corr_fanout",
    });
    await jobService.createQueued({
      jobType: "feed-generate",
      inngestEventId,
      eventName: "ledger/transaction.classified",
      organizationId,
      correlationId: "corr_fanout",
    });

    const rows = await prisma.jobRun.findMany({ where: { inngestEventId } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.jobType).sort()).toEqual(["feed-generate", "workflow-execute"]);
  });
});

describe("dead-letter queue", () => {
  it("routes a failed job to the dead-letter table and back", async () => {
    const key = { jobType: "test-job", inngestEventId: `evt_${Date.now()}_dlq` };
    const run = await jobService.createQueued({
      ...key,
      eventName: "ledger/sync.started",
      organizationId,
      correlationId: "corr_dlq",
    });
    await jobService.markFailed(key, { message: "permanent failure" }, 3);

    const entry = await jobService.createDeadLetter({
      jobRunId: run.id,
      jobType: key.jobType,
      organizationId,
      eventPayload: { name: "ledger/sync.started", data: { organizationId } },
      error: { message: "permanent failure" },
      originalRunId: "inngest_run_abc",
    });
    await jobService.markDeadLetter(key);

    const stored = await jobService.getRunById(run.id);
    expect(stored?.status).toBe("DEAD_LETTER");

    const unresolved = await jobService.listDeadLetters({ organizationId, includeResolved: false });
    expect(unresolved.map((d) => d.id)).toContain(entry.id);

    const resolved = await jobService.resolveDeadLetter(entry.id, "admin_user_1");
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.resolvedBy).toBe("admin_user_1");

    const stillUnresolved = await jobService.listDeadLetters({ organizationId, includeResolved: false });
    expect(stillUnresolved.map((d) => d.id)).not.toContain(entry.id);
  });
});

describe("worker restart / queue recovery", () => {
  it("finds RUNNING rows stuck past a given age (stale-job reaper candidates)", async () => {
    const key = { jobType: "test-job", inngestEventId: `evt_${Date.now()}_stale` };
    await jobService.createQueued({ ...key, eventName: "ledger/sync.started", organizationId, correlationId: "corr_stale" });
    await jobService.markRunning(key, "run_stale", 0);

    // Backdate startedAt to simulate a run stuck well past any reasonable timeout.
    await prisma.jobRun.update({
      where: { jobType_inngestEventId: { jobType: key.jobType, inngestEventId: key.inngestEventId } },
      data: { startedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    const stale = await jobService.findStaleRunning(10 * 60 * 1000);
    expect(stale.some((r) => r.inngestEventId === key.inngestEventId)).toBe(true);

    const notYetStale = await jobService.findStaleRunning(2 * 60 * 60 * 1000);
    expect(notYetStale.some((r) => r.inngestEventId === key.inngestEventId)).toBe(false);
  });
});

describe("metrics", () => {
  it("aggregates per-job-type success rate, failure rate, and status counts", async () => {
    const jobType = `metrics-test-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      const key = { jobType, inngestEventId: `evt_metrics_ok_${i}` };
      await jobService.createQueued({ ...key, eventName: "ledger/feed.generated", organizationId, correlationId: `corr_${i}` });
      await jobService.markRunning(key, `run_${i}`, 0);
      await jobService.markCompleted(key, {});
    }
    const failKey = { jobType, inngestEventId: "evt_metrics_fail" };
    await jobService.createQueued({ ...failKey, eventName: "ledger/feed.generated", organizationId, correlationId: "corr_fail" });
    await jobService.markRunning(failKey, "run_fail", 0);
    await jobService.markFailed(failKey, { message: "boom" }, 1);

    const typeMetrics = await jobService.getJobTypeMetrics(24);
    const entry = typeMetrics.find((m) => m.jobType === jobType);
    expect(entry).toBeDefined();
    expect(entry?.completedCount).toBe(3);
    expect(entry?.failedCount).toBe(1);
    expect(entry?.successRate).toBeCloseTo(0.75);

    const counts = await jobService.getStatusCounts(organizationId);
    expect(counts.COMPLETED).toBeGreaterThanOrEqual(3);
    expect(counts.FAILED).toBeGreaterThanOrEqual(1);

    const queueHealth = await jobService.getQueueHealth();
    expect(queueHealth).toHaveProperty("queueDepth");
    expect(queueHealth).toHaveProperty("runningCount");
  });
});
