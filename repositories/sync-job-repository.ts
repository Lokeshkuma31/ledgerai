/**
 * Sync Job Repository — Postgres-backed persistence for
 * lib/sync/history.ts's successor. lib/sync/queue.ts stays in-memory by
 * design (a live job queue, not persisted data — a queued/running job
 * that never got recorded to history shouldn't survive a reload as a
 * ghost entry).
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/src/generated/prisma/client";
import type {
  SyncIssue,
  SyncJob,
  SyncJobStatus as AppSyncJobStatus,
  SyncJobType,
} from "@/lib/sync/types";
import type {
  SyncJob as PrismaSyncJob,
  SyncJobStatus as PrismaSyncJobStatus,
  SyncProviderCategory as PrismaSyncProviderCategory,
  SyncRunType as PrismaSyncRunType,
} from "@/src/generated/prisma/client";

const RUN_TYPE_TO_DB: Record<SyncJobType, PrismaSyncRunType> = {
  initial: "INITIAL",
  incremental: "INCREMENTAL",
  manual: "MANUAL",
  scheduled: "SCHEDULED",
  resume: "RESUME",
  retry: "RETRY",
};
const RUN_TYPE_FROM_DB: Record<PrismaSyncRunType, SyncJobType> = {
  INITIAL: "initial",
  INCREMENTAL: "incremental",
  MANUAL: "manual",
  SCHEDULED: "scheduled",
  RESUME: "resume",
  RETRY: "retry",
};

const STATUS_TO_DB: Record<AppSyncJobStatus, PrismaSyncJobStatus> = {
  queued: "PENDING",
  running: "RUNNING",
  paused: "PAUSED",
  completed: "COMPLETED",
  partial: "PARTIAL",
  failed: "FAILED",
  cancelled: "CANCELLED",
};
const STATUS_FROM_DB: Record<PrismaSyncJobStatus, AppSyncJobStatus> = {
  PENDING: "queued",
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETED: "completed",
  PARTIAL: "partial",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

function toSyncJob(row: PrismaSyncJob): SyncJob {
  const startedAt = row.startedAt?.toISOString() ?? null;
  const completedAt = row.completedAt?.toISOString() ?? null;
  return {
    id: row.id,
    provider: row.providerId,
    plugin: row.plugin,
    type: RUN_TYPE_FROM_DB[row.runType],
    status: STATUS_FROM_DB[row.status],
    startedAt,
    completedAt,
    duration:
      startedAt && completedAt
        ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
        : null,
    itemsDiscovered: row.itemsDiscovered,
    itemsImported: row.itemsImported,
    itemsSkipped: row.itemsSkipped,
    duplicates: row.duplicates,
    errors: (row.errors as unknown as SyncIssue[]) ?? [],
    warnings: (row.warnings as unknown as SyncIssue[]) ?? [],
    retryCount: row.retryCount,
    lastCheckpoint: (row.lastCheckpoint as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    queuedAt: row.createdAt.toISOString(),
  };
}

/** lib/sync/types.ts's SyncProvider.category isn't threaded through
 * SyncJob itself — recordSyncJob's caller (the Sync Engine) knows the
 * provider's category via the registry, not the job record. Since the
 * schema requires providerCategory as a real column, callers pass it
 * alongside the job the same way they already look up the provider to
 * call sync() on it. */
export type ProviderCategoryInput =
  | "email"
  | "bank"
  | "sms"
  | "document"
  | "other";

const CATEGORY_TO_DB: Record<ProviderCategoryInput, PrismaSyncProviderCategory> = {
  email: "EMAIL_IMPORT",
  bank: "BANK_SYNC",
  sms: "SMS_IMPORT",
  document: "DOCUMENT",
  other: "OTHER",
};

/** Newest first is not guaranteed — callers that care about ordering sort
 * by queuedAt/startedAt themselves, same contract as the old
 * localStorage version. */
export async function getAllSyncJobs(organizationId: string): Promise<SyncJob[]> {
  const rows = await prisma.syncJob.findMany({ where: { organizationId } });
  return rows.map(toSyncJob);
}

export async function getSyncJobById(
  organizationId: string,
  id: string,
): Promise<SyncJob | undefined> {
  const row = await prisma.syncJob.findFirst({ where: { id, organizationId } });
  return row ? toSyncJob(row) : undefined;
}

export async function getSyncJobsByProvider(
  organizationId: string,
  providerId: string,
): Promise<SyncJob[]> {
  const rows = await prisma.syncJob.findMany({ where: { organizationId, providerId } });
  return rows.map(toSyncJob);
}

/** Most recently started job for a provider, or undefined if it has never
 * synced. */
export async function getLatestSyncJob(
  organizationId: string,
  providerId: string,
): Promise<SyncJob | undefined> {
  const row = await prisma.syncJob.findFirst({
    where: { organizationId, providerId, startedAt: { not: null } },
    orderBy: { startedAt: "desc" },
  });
  return row ? toSyncJob(row) : undefined;
}

/**
 * Upserts one job record by id — a job transitions queued -> running ->
 * completed/failed/cancelled over its lifetime, and every transition
 * replaces the same row rather than appending a new one, mirroring
 * lib/sync/history.ts::recordSyncJob exactly. Unlike the old
 * per-provider-capped-at-100 array, Postgres has no row-count cap here —
 * a future cleanup Inngest function (per the migration plan's background
 * job architecture) is the natural place to prune old rows, not this
 * write path.
 */
export async function recordSyncJob(
  organizationId: string,
  job: SyncJob,
  category: ProviderCategoryInput,
): Promise<SyncJob> {
  const data = {
    organizationId,
    providerId: job.provider,
    plugin: job.plugin,
    providerCategory: CATEGORY_TO_DB[category],
    runType: RUN_TYPE_TO_DB[job.type],
    status: STATUS_TO_DB[job.status],
    startedAt: job.startedAt ? new Date(job.startedAt) : null,
    completedAt: job.completedAt ? new Date(job.completedAt) : null,
    itemsDiscovered: job.itemsDiscovered,
    itemsImported: job.itemsImported,
    itemsSkipped: job.itemsSkipped,
    duplicates: job.duplicates,
    errors: job.errors as unknown as Prisma.InputJsonValue[],
    warnings: job.warnings as unknown as Prisma.InputJsonValue[],
    retryCount: job.retryCount,
    lastCheckpoint: job.lastCheckpoint as Prisma.InputJsonValue,
    metadata: job.metadata as Prisma.InputJsonValue,
  };
  const row = await prisma.syncJob.upsert({
    where: { id: job.id },
    create: { id: job.id, ...data },
    update: data,
  });
  return toSyncJob(row);
}

export async function clearSyncHistory(organizationId: string): Promise<void> {
  await prisma.syncJob.deleteMany({ where: { organizationId } });
}
