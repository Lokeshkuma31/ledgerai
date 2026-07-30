/**
 * Sync History — persisted, traceable record of every sync attempt across
 * every provider. Mirrors lib/workflows/history.ts's role for workflow
 * runs and lib/banks/sync-engine.ts's own per-connector history, but
 * provider-agnostic and capped per provider (not globally) so one noisy
 * provider can't crowd out another's history.
 */
import type { SyncJob } from "@/lib/sync/types";

const HISTORY_KEY = "ledgerai:sync:history";
const MAX_ENTRIES_PER_PROVIDER = 100;

function readHistory(): SyncJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SyncJob[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(jobs: SyncJob[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(jobs));
}

/** Newest first is not guaranteed by storage order — callers that care
 * about ordering should sort by queuedAt/startedAt themselves, the same
 * contract lib/workflows/history.ts's getAllRuns leaves to its callers. */
export function getAllSyncJobs(): SyncJob[] {
  return readHistory();
}

export function getSyncJobById(id: string): SyncJob | undefined {
  return readHistory().find((job) => job.id === id);
}

export function getSyncJobsByProvider(providerId: string): SyncJob[] {
  return readHistory().filter((job) => job.provider === providerId);
}

/** Most recently started job for a provider, or undefined if it has never
 * synced. Used by health.ts and the Retry action. */
export function getLatestSyncJob(providerId: string): SyncJob | undefined {
  const jobs = getSyncJobsByProvider(providerId).filter((job) => job.startedAt !== null);
  if (jobs.length === 0) return undefined;
  return jobs.reduce((latest, job) => (job.startedAt! > latest.startedAt! ? job : latest));
}

/**
 * Upserts one job record by id — a job transitions queued -> running ->
 * completed/failed/cancelled over its lifetime, and every transition
 * replaces the same history entry rather than appending a new one each
 * time, mirroring lib/banks/sync-engine.ts's persistRun/updateRun split
 * collapsed into a single idempotent call.
 */
export function recordSyncJob(job: SyncJob): SyncJob {
  const all = readHistory();
  const index = all.findIndex((j) => j.id === job.id);
  if (index !== -1) {
    all[index] = job;
    writeHistory(all);
    return job;
  }

  const forProvider = all.filter((j) => j.provider === job.provider);
  const others = all.filter((j) => j.provider !== job.provider);
  const updatedForProvider = [...forProvider, job].slice(-MAX_ENTRIES_PER_PROVIDER);
  writeHistory([...others, ...updatedForProvider]);
  return job;
}

export function clearSyncHistory(): SyncJob[] {
  writeHistory([]);
  return [];
}
