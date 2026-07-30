/**
 * Health — deterministic aggregate stats over Sync History plus a live
 * queue snapshot, per-provider and engine-wide. Mirrors
 * lib/workflows/engine.ts's computeWorkflowStatistics and
 * lib/feed/statistics.ts's approach: plain reduction over persisted
 * records, no LLM, no estimation.
 */
import { getAllSyncProviders, getSyncProvider } from "@/lib/sync/registry";
import { getSyncJobsByProvider } from "@/lib/sync/history";
import type { SyncEngineHealth, SyncJob, SyncProviderHealth, SyncProviderHealthSnapshot, SyncQueueSnapshot } from "@/lib/sync/types";

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function isSuccessful(job: SyncJob): boolean {
  return job.status === "completed" || job.status === "partial";
}

/** A provider's own health() throwing must never break the dashboard for
 * every other provider — mirrors lib/feed/engine.ts's per-contributor
 * try/catch. */
async function safeConnectionHealth(providerId: string, health: () => Promise<SyncProviderHealthSnapshot>): Promise<SyncProviderHealthSnapshot> {
  try {
    return await health();
  } catch (error) {
    return {
      status: "unknown",
      message: error instanceof Error ? error.message : `Provider "${providerId}" health check threw.`,
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function computeProviderHealth(
  providerId: string,
  queueSnapshot: SyncQueueSnapshot,
): Promise<SyncProviderHealth | null> {
  const provider = getSyncProvider(providerId);
  if (!provider) return null;

  const jobs = getSyncJobsByProvider(providerId).filter((job) => job.completedAt !== null);
  const durations = jobs.map((job) => job.duration).filter((d): d is number => d !== null);
  const importedCounts = jobs.map((job) => job.itemsImported);
  const successCount = jobs.filter(isSuccessful).length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  const latestSuccessful = jobs
    .filter(isSuccessful)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0];

  return {
    providerId,
    providerName: provider.name,
    category: provider.category,
    queueSize: queueSnapshot.queued.filter((job) => job.provider === providerId).length,
    runningJobs: queueSnapshot.running.filter((job) => job.provider === providerId).length,
    failedJobs: failedCount,
    averageSyncTimeMs: Math.round(average(durations)),
    averageItemsImported: Math.round(average(importedCounts)),
    successRate: jobs.length === 0 ? 0 : Math.round((successCount / jobs.length) * 100) / 100,
    lastSuccessfulSyncAt: latestSuccessful?.completedAt ?? null,
    connection: await safeConnectionHealth(providerId, () => provider.health()),
  };
}

export async function computeSyncEngineHealth(queueSnapshot: SyncQueueSnapshot): Promise<SyncEngineHealth> {
  const providers = getAllSyncProviders();
  const byProvider = (
    await Promise.all(providers.map((provider) => computeProviderHealth(provider.id, queueSnapshot)))
  ).filter((health): health is SyncProviderHealth => health !== null);

  const allJobs = providers.flatMap((provider) => getSyncJobsByProvider(provider.id)).filter((job) => job.completedAt !== null);
  const durations = allJobs.map((job) => job.duration).filter((d): d is number => d !== null);
  const importedCounts = allJobs.map((job) => job.itemsImported);
  const successCount = allJobs.filter(isSuccessful).length;
  const failedCount = allJobs.filter((job) => job.status === "failed").length;
  const lastSuccessfulSyncAt =
    byProvider
      .map((health) => health.lastSuccessfulSyncAt)
      .filter((date): date is string => date !== null)
      .sort()
      .reverse()[0] ?? null;

  return {
    queueSize: queueSnapshot.queued.length,
    runningJobs: queueSnapshot.running.length,
    failedJobs: failedCount,
    averageSyncTimeMs: Math.round(average(durations)),
    averageItemsImported: Math.round(average(importedCounts)),
    successRate: allJobs.length === 0 ? 0 : Math.round((successCount / allJobs.length) * 100) / 100,
    lastSuccessfulSyncAt,
    byProvider,
  };
}
