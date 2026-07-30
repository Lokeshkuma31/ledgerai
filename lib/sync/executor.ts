/**
 * Executor — runs exactly one attempt of a SyncJob against its provider.
 * Never retries itself (lib/sync/queue.ts owns retry policy) and never
 * persists anything (the caller records the returned job via
 * lib/sync/history.ts) — mirrors lib/workflows/executor.ts's per-step
 * execution role, kept independent of the Queue the same way that file is
 * independent of lib/workflows/runner.ts.
 */
import type { SyncExecutionInput, SyncJob, SyncJobStatus, SyncProvider } from "@/lib/sync/types";

/** "partial" covers two distinct reasons more work remains: some items
 * errored while others still succeeded, or the provider stopped at a
 * self-imposed batch limit (a non-null checkpoint) with zero errors —
 * either way, resumeSync should be able to pick this job back up. */
function resolveStatus(
  aborted: boolean,
  errorCount: number,
  itemsDiscovered: number,
  itemsImported: number,
  checkpoint: string | null,
): SyncJobStatus {
  if (aborted) return "cancelled";
  if (errorCount > 0 && itemsDiscovered === 0 && itemsImported === 0) return "failed";
  return errorCount > 0 || checkpoint !== null ? "partial" : "completed";
}

/**
 * A thrown error from provider.sync() is caught and turned into a
 * "failed" job rather than propagating — the same way
 * lib/workflows/executor.ts never lets one step's exception escape into
 * its runner.
 */
export async function executeSyncJob(
  job: SyncJob,
  provider: SyncProvider,
  input: SyncExecutionInput,
  now: Date = new Date(),
): Promise<SyncJob> {
  const startedAt = job.startedAt ?? now.toISOString();
  const running: SyncJob = { ...job, status: "running", startedAt };

  try {
    const result = await provider.sync(input);
    const completedAt = new Date();

    return {
      ...running,
      status: resolveStatus(input.signal.aborted, result.errors.length, result.itemsDiscovered, result.itemsImported, result.checkpoint),
      completedAt: completedAt.toISOString(),
      duration: completedAt.getTime() - new Date(startedAt).getTime(),
      itemsDiscovered: result.itemsDiscovered,
      itemsImported: result.itemsImported,
      itemsSkipped: result.itemsSkipped,
      duplicates: result.duplicates,
      errors: result.errors,
      warnings: result.warnings,
      lastCheckpoint: result.checkpoint,
      metadata: { ...running.metadata, ...(result.metadata ?? {}) },
    };
  } catch (error) {
    const completedAt = new Date();
    return {
      ...running,
      status: "failed",
      completedAt: completedAt.toISOString(),
      duration: completedAt.getTime() - new Date(startedAt).getTime(),
      errors: [
        ...running.errors,
        { message: error instanceof Error ? error.message : "Unknown sync error.", at: completedAt.toISOString() },
      ],
    };
  }
}
