/**
 * Job Repository — Postgres persistence for the background job platform's
 * own execution-tracking rows (JobRun/JobDeadLetter). Mirrors the
 * repositories/+services/ split every other domain uses; lib/jobs/* and
 * services/jobs/job-service.ts are the only callers.
 *
 * JobStatus's TS union (types/job.ts) and Prisma's JobStatus enum
 * (prisma/schema.prisma) use identical string values by design, so unlike
 * e.g. repositories/sync-job-repository.ts this file needs no TO_DB/
 * FROM_DB translation table — the same string is valid on both sides.
 *
 * Every row is looked up by the (jobType, inngestEventId) compound key,
 * never inngestEventId alone — a single Inngest event can fan out to
 * several subscribing functions (e.g. ledger/transaction.classified
 * triggers both workflow-execute and feed-generate), each with its own
 * execution and its own JobRun row. See prisma/schema.prisma's JobRun
 * model comment and docs/job-platform/08-worker-architecture.md §8.2.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma, JobRun as PrismaJobRun, JobDeadLetter as PrismaJobDeadLetter } from "@/src/generated/prisma/client";
import type { JobDeadLetter, JobRun, JobStatus, JobStatusCounts, JobTypeMetrics } from "@/types/job";

function toJobRun(row: PrismaJobRun): JobRun {
  return {
    id: row.id,
    jobType: row.jobType,
    eventName: row.eventName,
    inngestEventId: row.inngestEventId,
    inngestRunId: row.inngestRunId,
    organizationId: row.organizationId,
    status: row.status as JobStatus,
    attempt: row.attempt,
    progress: row.progress,
    correlationId: row.correlationId,
    traceId: row.traceId,
    input: row.input,
    output: row.output,
    error: row.error,
    queuedAt: row.queuedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    relatedIds: row.relatedIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDeadLetter(row: PrismaJobDeadLetter & { jobRun?: PrismaJobRun }): JobDeadLetter {
  return {
    id: row.id,
    jobRunId: row.jobRunId,
    jobType: row.jobType,
    organizationId: row.organizationId,
    eventPayload: row.eventPayload,
    error: row.error,
    originalRunId: row.originalRunId,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: row.resolvedBy,
    retryOfId: row.retryOfId,
    createdAt: row.createdAt.toISOString(),
    jobRun: row.jobRun ? toJobRun(row.jobRun) : undefined,
  };
}

/** The compound identity every mutation below looks a JobRun up by. */
export interface JobKey {
  jobType: string;
  inngestEventId: string;
}

function keyWhere(key: JobKey) {
  return { jobType_inngestEventId: { jobType: key.jobType, inngestEventId: key.inngestEventId } } as const;
}

export interface CreateQueuedInput extends JobKey {
  eventName: string;
  organizationId?: string;
  correlationId: string;
  input?: unknown;
  relatedIds?: string[];
  traceId?: string;
}

/** Upserts on (jobType, inngestEventId) — a redispatched event with the
 * same id (Inngest's own broker-level dedup key, see docs/job-platform/
 * 04-queue-strategy.md §4.6) converges to the same JobRun row for that
 * function rather than creating a duplicate, satisfying the idempotency
 * requirement at the tracking layer itself, not just at the business-write
 * layer. */
export async function createQueued(data: CreateQueuedInput): Promise<JobRun> {
  const row = await prisma.jobRun.upsert({
    where: keyWhere(data),
    create: {
      jobType: data.jobType,
      eventName: data.eventName,
      inngestEventId: data.inngestEventId,
      organizationId: data.organizationId,
      correlationId: data.correlationId,
      input: data.input as Prisma.InputJsonValue,
      relatedIds: data.relatedIds ?? [],
      traceId: data.traceId ?? crypto.randomUUID(),
      status: "QUEUED",
    },
    update: {},
  });
  return toJobRun(row);
}

export async function markRunning(key: JobKey, inngestRunId: string, attempt: number): Promise<JobRun> {
  const row = await prisma.jobRun.update({
    where: keyWhere(key),
    data: { status: "RUNNING", inngestRunId, attempt, startedAt: new Date() },
  });
  return toJobRun(row);
}

export async function markRetrying(key: JobKey, attempt: number, error: unknown): Promise<JobRun> {
  const row = await prisma.jobRun.update({
    where: keyWhere(key),
    data: { status: "RETRYING", attempt, error: error as Prisma.InputJsonValue },
  });
  return toJobRun(row);
}

export async function markCompleted(key: JobKey, output?: unknown): Promise<JobRun> {
  const existing = await prisma.jobRun.findUniqueOrThrow({ where: keyWhere(key) });
  const completedAt = new Date();
  const durationMs = existing.startedAt ? completedAt.getTime() - existing.startedAt.getTime() : null;
  const row = await prisma.jobRun.update({
    where: keyWhere(key),
    data: {
      status: "COMPLETED",
      output: (output ?? null) as Prisma.InputJsonValue,
      completedAt,
      durationMs,
      progress: 100,
    },
  });
  return toJobRun(row);
}

export async function markFailed(key: JobKey, error: unknown, attempt: number): Promise<JobRun> {
  const existing = await prisma.jobRun.findUniqueOrThrow({ where: keyWhere(key) });
  const completedAt = new Date();
  const durationMs = existing.startedAt ? completedAt.getTime() - existing.startedAt.getTime() : null;
  const row = await prisma.jobRun.update({
    where: keyWhere(key),
    data: { status: "FAILED", error: error as Prisma.InputJsonValue, attempt, completedAt, durationMs },
  });
  return toJobRun(row);
}

export async function markCancelled(key: JobKey): Promise<JobRun> {
  const row = await prisma.jobRun.update({
    where: keyWhere(key),
    data: { status: "CANCELLED", completedAt: new Date() },
  });
  return toJobRun(row);
}

export async function markDeadLetter(key: JobKey): Promise<JobRun> {
  const row = await prisma.jobRun.update({
    where: keyWhere(key),
    data: { status: "DEAD_LETTER" },
  });
  return toJobRun(row);
}

export async function setProgress(key: JobKey, progress: number): Promise<void> {
  await prisma.jobRun
    .update({ where: keyWhere(key), data: { progress: Math.max(0, Math.min(100, progress)) } })
    .catch(() => undefined);
}

export async function getByKey(key: JobKey): Promise<JobRun | undefined> {
  const row = await prisma.jobRun.findUnique({ where: keyWhere(key) });
  return row ? toJobRun(row) : undefined;
}

export async function getById(id: string): Promise<JobRun | undefined> {
  const row = await prisma.jobRun.findUnique({ where: { id } });
  return row ? toJobRun(row) : undefined;
}

export async function listRecent(params: {
  organizationId?: string;
  jobType?: string;
  status?: JobStatus;
  correlationId?: string;
  limit?: number;
}): Promise<JobRun[]> {
  const rows = await prisma.jobRun.findMany({
    where: {
      organizationId: params.organizationId,
      jobType: params.jobType,
      status: params.status,
      correlationId: params.correlationId,
    },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 50,
  });
  return rows.map(toJobRun);
}

export async function countsByStatus(organizationId?: string): Promise<JobStatusCounts> {
  const grouped = await prisma.jobRun.groupBy({
    by: ["status"],
    where: organizationId ? { organizationId } : undefined,
    _count: { _all: true },
  });
  const counts: JobStatusCounts = {
    QUEUED: 0,
    SCHEDULED: 0,
    RUNNING: 0,
    RETRYING: 0,
    COMPLETED: 0,
    FAILED: 0,
    CANCELLED: 0,
    DEAD_LETTER: 0,
  };
  for (const row of grouped) counts[row.status as JobStatus] = row._count._all;
  return counts;
}

/** One row per distinct jobType, aggregated over the rolling window —
 * powers the /jobs dashboard summary and services/jobs/job-service.ts's
 * metrics pass-through. See docs/job-platform/08-worker-architecture.md §8.7. */
export async function getJobTypeMetrics(windowStart: Date): Promise<JobTypeMetrics[]> {
  const jobTypes = await prisma.jobRun.findMany({
    where: { createdAt: { gte: windowStart } },
    distinct: ["jobType"],
    select: { jobType: true },
  });

  return Promise.all(
    jobTypes.map(async ({ jobType }) => {
      const where = { jobType, createdAt: { gte: windowStart } };
      const [total, completed, failed, deadLetter, running, queued, durationAgg, attemptAgg, latencyRows] =
        await Promise.all([
          prisma.jobRun.count({ where }),
          prisma.jobRun.count({ where: { ...where, status: "COMPLETED" } }),
          prisma.jobRun.count({ where: { ...where, status: "FAILED" } }),
          prisma.jobRun.count({ where: { ...where, status: "DEAD_LETTER" } }),
          prisma.jobRun.count({ where: { ...where, status: "RUNNING" } }),
          prisma.jobRun.count({ where: { ...where, status: { in: ["QUEUED", "SCHEDULED"] } } }),
          prisma.jobRun.aggregate({ where: { ...where, status: "COMPLETED" }, _avg: { durationMs: true } }),
          prisma.jobRun.aggregate({ where: { ...where, status: "COMPLETED" }, _avg: { attempt: true } }),
          prisma.jobRun.findMany({
            where: { ...where, startedAt: { not: null } },
            select: { queuedAt: true, startedAt: true },
            take: 200,
          }),
        ]);

      const latencies = latencyRows
        .filter((r) => r.startedAt)
        .map((r) => r.startedAt!.getTime() - r.queuedAt.getTime());
      const avgQueueLatencyMs = latencies.length
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : null;

      return {
        jobType,
        avgDurationMs: durationAgg._avg.durationMs,
        successRate: total > 0 ? completed / total : null,
        failureRate: total > 0 ? (failed + deadLetter) / total : null,
        avgAttempts: attemptAgg._avg.attempt,
        avgQueueLatencyMs,
        runningCount: running,
        queuedCount: queued,
        completedCount: completed,
        failedCount: failed,
        deadLetterCount: deadLetter,
      };
    }),
  );
}

export async function getOldestPendingAgeMs(): Promise<number | null> {
  const oldest = await prisma.jobRun.findFirst({
    where: { status: { in: ["QUEUED", "SCHEDULED"] } },
    orderBy: { queuedAt: "asc" },
    select: { queuedAt: true },
  });
  return oldest ? Date.now() - oldest.queuedAt.getTime() : null;
}

/** Powers the stale-job reaper (docs/job-platform/06-scheduling-strategy.md
 * §6.2) — rows stuck RUNNING past a per-job-type timeout are candidates
 * for forced failure + dead-letter routing. */
export async function findStaleRunning(olderThan: Date): Promise<JobRun[]> {
  const rows = await prisma.jobRun.findMany({
    where: { status: "RUNNING", startedAt: { lt: olderThan } },
  });
  return rows.map(toJobRun);
}

// --- dead letters ------------------------------------------------------------

export interface CreateDeadLetterInput {
  jobRunId: string;
  jobType: string;
  organizationId?: string;
  eventPayload: unknown;
  error: unknown;
  originalRunId: string;
  retryOfId?: string;
}

export async function createDeadLetter(data: CreateDeadLetterInput): Promise<JobDeadLetter> {
  const row = await prisma.jobDeadLetter.upsert({
    where: { jobRunId: data.jobRunId },
    create: {
      jobRunId: data.jobRunId,
      jobType: data.jobType,
      organizationId: data.organizationId,
      eventPayload: data.eventPayload as Prisma.InputJsonValue,
      error: data.error as Prisma.InputJsonValue,
      originalRunId: data.originalRunId,
      retryOfId: data.retryOfId,
    },
    update: {},
  });
  return toDeadLetter(row);
}

export async function listDeadLetters(params: {
  organizationId?: string;
  includeResolved?: boolean;
  limit?: number;
}): Promise<JobDeadLetter[]> {
  const rows = await prisma.jobDeadLetter.findMany({
    where: {
      organizationId: params.organizationId,
      resolvedAt: params.includeResolved ? undefined : null,
    },
    include: { jobRun: true },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 50,
  });
  return rows.map(toDeadLetter);
}

export async function getDeadLetterById(id: string): Promise<JobDeadLetter | undefined> {
  const row = await prisma.jobDeadLetter.findUnique({ where: { id }, include: { jobRun: true } });
  return row ? toDeadLetter(row) : undefined;
}

export async function resolveDeadLetter(id: string, resolvedBy: string): Promise<JobDeadLetter> {
  const row = await prisma.jobDeadLetter.update({
    where: { id },
    data: { resolvedAt: new Date(), resolvedBy },
    include: { jobRun: true },
  });
  return toDeadLetter(row);
}

export async function countUnresolvedDeadLetters(organizationId?: string): Promise<number> {
  return prisma.jobDeadLetter.count({ where: { organizationId, resolvedAt: null } });
}
