/**
 * Sync Job Service — thin pass-through to repositories/sync-job-repository.ts.
 * Per the migration plan (§1 Tier B #1), SyncJob/SyncHistoryEvent are close
 * enough to a 1:1 match for the old recordSyncJob upsert semantics that a
 * heavier service layer isn't warranted — this exists only so callers
 * import from services/* consistently with every other domain.
 */
import * as syncJobRepository from "@/repositories/sync-job-repository";
import type { ProviderCategoryInput } from "@/repositories/sync-job-repository";
import type { SyncJob } from "@/lib/sync/types";

export async function listSyncJobs(organizationId: string): Promise<SyncJob[]> {
  return syncJobRepository.getAllSyncJobs(organizationId);
}

export async function getSyncJobById(
  organizationId: string,
  id: string,
): Promise<SyncJob | undefined> {
  return syncJobRepository.getSyncJobById(organizationId, id);
}

export async function getSyncJobsByProvider(
  organizationId: string,
  providerId: string,
): Promise<SyncJob[]> {
  return syncJobRepository.getSyncJobsByProvider(organizationId, providerId);
}

export async function getLatestSyncJob(
  organizationId: string,
  providerId: string,
): Promise<SyncJob | undefined> {
  return syncJobRepository.getLatestSyncJob(organizationId, providerId);
}

export async function recordSyncJob(
  organizationId: string,
  job: SyncJob,
  category: ProviderCategoryInput,
): Promise<SyncJob> {
  return syncJobRepository.recordSyncJob(organizationId, job, category);
}

export async function clearSyncHistory(organizationId: string): Promise<void> {
  return syncJobRepository.clearSyncHistory(organizationId);
}
