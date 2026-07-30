/**
 * Unified Synchronization Engine — the public composing entry point every
 * provider, workflow, and dashboard component talks to. Mirrors
 * lib/workflows/engine.ts and lib/feed/engine.ts's own composing role:
 * wires together the independent registry/queue/executor/scheduler/
 * history/health/conflict modules without any of them depending on each
 * other directly.
 *
 * Every connected provider (Email, Bank, SMS, Document, future plugins)
 * registers itself here (see registry.ts's registerSyncProvider) instead
 * of running its own synchronization loop; this file becomes the single
 * source of truth for when something last synced, what's queued/running,
 * and what happened historically. A provider's own sync() implementation
 * still owns its real fetch/parse/duplicate-detection logic — this engine
 * never re-implements it, it only schedules, queues, retries, and records
 * the outcome (see types.ts's SyncProvider contract).
 */
import { registerCoachSyncSummaryContributor, type SyncCoachSummary } from "@/lib/coach/contributors";
import { registerFeedContributor } from "@/lib/feed/engine";
import { registerIndexContributor } from "@/lib/index";
import { runWorkflowsForTrigger } from "@/lib/workflows/engine";
import { executeSyncJob } from "@/lib/sync/executor";
import { computeProviderHealth, computeSyncEngineHealth } from "@/lib/sync/health";
import { getAllSyncJobs, getLatestSyncJob, getSyncJobById, getSyncJobsByProvider, recordSyncJob } from "@/lib/sync/history";
import { syncQueue, type EnqueueOptions } from "@/lib/sync/queue";
import { getAllSyncProviders, getSyncProvider } from "@/lib/sync/registry";
import { getProvidersDueForSync } from "@/lib/sync/scheduler";
import type {
  SyncEngineHealth,
  SyncExecutionInput,
  SyncJob,
  SyncJobType,
  SyncProvider,
  SyncProviderHealth,
  SyncQueueSnapshot,
} from "@/lib/sync/types";
import type { FeedItem } from "@/types/feed";
import type { IndexedObject } from "@/types/index";

export { registerSyncProvider, getAllSyncProviders, getSyncProvider } from "@/lib/sync/registry";
export { getAllSyncJobs, getSyncJobById, getSyncJobsByProvider, getLatestSyncJob, clearSyncHistory } from "@/lib/sync/history";
export { getScheduleFrequency, setScheduleFrequency, getProviderSchedule, isDueForSync } from "@/lib/sync/scheduler";
export { resolveConflicts, recordDeletedItem, recordProviderVersionChange, recordTimestampConflict } from "@/lib/sync/conflict";
export type { ConflictDetector, ConflictResolutionOutcome } from "@/lib/sync/conflict";
export { computeProviderHealth, computeSyncEngineHealth } from "@/lib/sync/health";

/** Jobs whose next abort should resolve as "paused" (resumable) rather
 * than "cancelled" (terminal) — the only difference between the two
 * actions at the executor level is which of these sets requested it. */
const pauseRequested = new Set<string>();

export function getQueueSnapshot(): SyncQueueSnapshot {
  return { queued: syncQueue.getQueued(), running: syncQueue.getRunning(), concurrencyLimit: syncQueue.getConcurrencyLimit() };
}

export function setConcurrencyLimit(limit: number): void {
  syncQueue.setConcurrencyLimit(limit);
}

export function getConcurrencyLimit(): number {
  return syncQueue.getConcurrencyLimit();
}

async function afterJobCompletion(job: SyncJob, previousJobs: SyncJob[]): Promise<void> {
  const now = new Date();
  const context = { job, jobs: [job] };

  if (job.status === "completed" || job.status === "partial") {
    await runWorkflowsForTrigger("sync-completed", context, now);
    if (job.itemsImported >= LARGE_IMPORT_THRESHOLD) {
      await runWorkflowsForTrigger("sync-large-import", context, now);
    }
    if (job.duplicates > 0) {
      await runWorkflowsForTrigger("sync-duplicate-detected", context, now);
    }
    // Reconnected: the job right before this one (for the same provider)
    // failed, and this one succeeded — the provider recovered.
    const previousForProvider = previousJobs
      .filter((j) => j.provider === job.provider && j.id !== job.id && j.completedAt !== null)
      .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0];
    if (previousForProvider?.status === "failed") {
      await runWorkflowsForTrigger("sync-provider-reconnected", context, now);
    }
  } else if (job.status === "failed") {
    await runWorkflowsForTrigger("sync-failed", context, now);
  }
}

/** Every job currently executing, keyed by id — lets callers (tests, and
 * anything that just enqueued a job) await settlement instead of polling
 * history, via waitForSyncJob below. Not a persistence mechanism: entries
 * are removed the moment their job settles. */
const jobCompletions = new Map<string, Promise<SyncJob>>();

/** Runs one dequeued job to completion, then tries to start whatever's
 * next — the same "pump" pattern lib/workflows/runner.ts's inFlight
 * bookkeeping enables, just generalized to a real concurrency-limited
 * queue instead of a single in-flight set per workflow id. */
async function runJob(job: SyncJob, provider: SyncProvider): Promise<SyncJob> {
  const previousJobs = getSyncJobsByProvider(job.provider);
  const controller = syncQueue.markRunning(job);
  const startedAt = new Date().toISOString();
  recordSyncJob({ ...job, status: "running", startedAt });

  const input: SyncExecutionInput = {
    mode: job.type,
    cursor: provider.getCursor(),
    checkpoint: job.lastCheckpoint,
    signal: controller.signal,
  };

  const finished = await executeSyncJob({ ...job, startedAt }, provider, input);
  const finalJob: SyncJob =
    pauseRequested.has(job.id) && finished.status === "cancelled" ? { ...finished, status: "paused" } : finished;
  pauseRequested.delete(job.id);

  recordSyncJob(finalJob);
  syncQueue.markFinished(job.id);

  await afterJobCompletion(finalJob, previousJobs);
  pumpQueue();
  return finalJob;
}

/** Drains as many queued jobs as the concurrency limit allows, right now.
 * Safe to call repeatedly — a no-op once the queue is empty or every slot
 * is busy. */
export function pumpQueue(): void {
  while (syncQueue.canRunMore()) {
    const job = syncQueue.dequeueNext();
    if (!job) break;
    const provider = getSyncProvider(job.provider);
    if (!provider) {
      recordSyncJob({
        ...job,
        status: "failed",
        completedAt: new Date().toISOString(),
        errors: [{ message: `Provider "${job.provider}" is no longer registered.`, at: new Date().toISOString() }],
      });
      continue;
    }
    const promise = runJob(job, provider);
    jobCompletions.set(job.id, promise);
    promise.finally(() => jobCompletions.delete(job.id));
  }
}

/** Awaits a specific job's settlement (completed/partial/failed/cancelled/
 * paused) — undefined if that job isn't currently running (already
 * finished, or never existed). The dashboard doesn't need this (it polls
 * getQueueSnapshot instead); it exists mainly so tests don't need to poll. */
export function waitForSyncJob(jobId: string): Promise<SyncJob> | undefined {
  return jobCompletions.get(jobId);
}

function enqueueAndStart(provider: SyncProvider, options: EnqueueOptions): SyncJob | undefined {
  const job = syncQueue.enqueue(provider, options);
  if (!job) return undefined;
  recordSyncJob(job);
  pumpQueue();
  return job;
}

/** Starts a sync for `providerId`. Returns undefined without doing
 * anything if that provider already has an active (queued or running) job
 * — "Prevent duplicate jobs" from the spec. */
export function startSync(providerId: string, type: SyncJobType = "manual"): SyncJob | undefined {
  const provider = getSyncProvider(providerId);
  if (!provider) throw new Error(`Sync provider "${providerId}" is not registered.`);
  return enqueueAndStart(provider, { type });
}

/** Every enabled provider due for a scheduled sync right now — called by
 * the dashboard (or a test) on whatever cadence it chooses; this engine
 * runs no timer of its own (see the milestone's "Do NOT Add" list). */
export function runScheduledSyncs(now: Date = new Date()): SyncJob[] {
  const lastRunAtByProvider: Record<string, string | null> = {};
  for (const provider of getAllSyncProviders()) {
    lastRunAtByProvider[provider.id] = getLatestSyncJob(provider.id)?.completedAt ?? null;
  }
  const due = getProvidersDueForSync(lastRunAtByProvider, now);
  const started: SyncJob[] = [];
  for (const providerId of due) {
    const job = startSync(providerId, "scheduled");
    if (job) started.push(job);
  }
  return started;
}

/** Cooperative cancellation: aborts a running job's signal, or removes a
 * still-queued one outright. A job cancelled while queued (never started)
 * has no executor to finalize it, so this records that outcome directly. */
export function cancelSync(jobId: string): boolean {
  const existing = getSyncJobById(jobId);
  const wasQueued = existing?.status === "queued";
  const removed = syncQueue.cancel(jobId);
  if (!removed) return false;
  if (wasQueued && existing) {
    recordSyncJob({ ...existing, status: "cancelled", completedAt: new Date().toISOString() });
  }
  return true;
}

/** Same mechanism as cancelSync, but the resulting job is resumable
 * ("paused") rather than terminal ("cancelled") — resumeSync picks it back
 * up from its lastCheckpoint. */
export function pauseSync(jobId: string): boolean {
  const existing = getSyncJobById(jobId);
  const wasQueued = existing?.status === "queued";
  pauseRequested.add(jobId);
  const removed = syncQueue.cancel(jobId);
  if (!removed) {
    pauseRequested.delete(jobId);
    return false;
  }
  if (wasQueued && existing) {
    recordSyncJob({ ...existing, status: "paused", completedAt: new Date().toISOString() });
    pauseRequested.delete(jobId);
  }
  return true;
}

/** Re-runs a provider's most recent failed/partial sync from its last
 * checkpoint. Returns undefined (rather than throwing) when there's
 * nothing to retry — mirrors lib/banks/sync-engine.ts's retryFailedSync. */
export function retrySync(providerId: string): SyncJob | undefined {
  const provider = getSyncProvider(providerId);
  if (!provider) throw new Error(`Sync provider "${providerId}" is not registered.`);
  const latest = getLatestSyncJob(providerId);
  if (!latest || (latest.status !== "failed" && latest.status !== "partial")) return undefined;
  return enqueueAndStart(provider, { type: "retry", checkpoint: latest.lastCheckpoint, retryCount: latest.retryCount + 1 });
}

/** Continues a paused or cancelled sync from its lastCheckpoint. Returns
 * undefined if the provider's latest job has nothing to resume from. */
export function resumeSync(providerId: string): SyncJob | undefined {
  const provider = getSyncProvider(providerId);
  if (!provider) throw new Error(`Sync provider "${providerId}" is not registered.`);
  const latest = getLatestSyncJob(providerId);
  if (!latest || !latest.lastCheckpoint) return undefined;
  if (latest.status !== "paused" && latest.status !== "cancelled" && latest.status !== "failed" && latest.status !== "partial") {
    return undefined;
  }
  return enqueueAndStart(provider, { type: "resume", checkpoint: latest.lastCheckpoint, retryCount: latest.retryCount });
}

export async function getProviderHealth(providerId: string): Promise<SyncProviderHealth | null> {
  return computeProviderHealth(providerId, getQueueSnapshot());
}

export async function getEngineHealth(): Promise<SyncEngineHealth> {
  return computeSyncEngineHealth(getQueueSnapshot());
}

// --- Feed / Search / Coach contributions -----------------------------------

const LARGE_IMPORT_THRESHOLD = 50;

/** One item per provider's most recent job, plus a "Retry Scheduled" and
 * "Provider Offline" item where applicable — covers every event type the
 * spec names. Mirrors lib/banks/sync-engine.ts's feedItemForConnector, but
 * provider-agnostic across the whole engine. */
function buildSyncFeedItems(): FeedItem[] {
  const items: FeedItem[] = [];
  const now = new Date().toISOString();

  for (const provider of getAllSyncProviders()) {
    const jobs = getSyncJobsByProvider(provider.id);
    if (jobs.length === 0) continue;

    const latest = [...jobs].sort((a, b) => b.queuedAt.localeCompare(a.queuedAt))[0];
    const base = {
      priority: 0, // recomputed by lib/feed/prioritizer.ts from type/severity/confidence
      sourceEngine: "feed" as const,
      explanationId: null,
      isRead: false,
      isPinned: false,
      isDismissed: false,
      expiresAt: null,
      relatedObjectIds: [] as string[],
      confidence: 1,
      metadata: { providerId: provider.id, jobId: latest.id },
    };

    if (latest.status === "running") {
      items.push({
        ...base,
        id: `sync:${provider.id}:${latest.id}:started`,
        type: "system-insight" as const,
        title: "Synchronization Started",
        summary: `${provider.name} synchronization is in progress.`,
        severity: "info" as const,
        createdAt: latest.startedAt ?? now,
      });
    } else if (latest.status === "completed" || latest.status === "partial") {
      const isLarge = latest.itemsImported >= LARGE_IMPORT_THRESHOLD;
      items.push({
        ...base,
        id: `sync:${provider.id}:${latest.id}:completed`,
        type: "system-insight" as const,
        title: isLarge ? "Large Import Completed" : "Synchronization Completed",
        summary: `${provider.name} synced ${latest.itemsImported} new item(s), skipped ${latest.itemsSkipped}, ignored ${latest.duplicates} duplicate(s).`,
        severity: latest.status === "partial" ? ("warning" as const) : ("info" as const),
        createdAt: latest.completedAt ?? now,
      });
    } else if (latest.status === "failed") {
      items.push({
        ...base,
        id: `sync:${provider.id}:${latest.id}:failed`,
        type: "system-insight" as const,
        title: "Synchronization Failed",
        summary: `${provider.name} failed to synchronize${latest.errors[0] ? `: ${latest.errors[0].message}` : "."}`,
        severity: "warning" as const,
        createdAt: latest.completedAt ?? now,
      });
    }

    if (latest.type === "retry" && (latest.status === "queued" || latest.status === "running")) {
      items.push({
        ...base,
        id: `sync:${provider.id}:${latest.id}:retry-scheduled`,
        type: "system-insight" as const,
        title: "Retry Scheduled",
        summary: `${provider.name}'s synchronization is being retried (attempt ${latest.retryCount + 1}).`,
        severity: "info" as const,
        createdAt: now,
      });
    }

    const recent = jobs.filter((j) => j.completedAt !== null).slice(-3);
    if (recent.length >= 3 && recent.every((j) => j.status === "failed")) {
      items.push({
        ...base,
        id: `sync:${provider.id}:offline`,
        type: "system-insight" as const,
        title: "Provider Offline",
        summary: `${provider.name} has failed its last ${recent.length} synchronization attempts and may be offline.`,
        severity: "warning" as const,
        createdAt: now,
      });
    }
  }

  return items;
}

/** Indexes every completed sync job for the Financial Semantic Index / Query
 * Engine — no changes to lib/index/builder.ts needed, the same generic
 * registerIndexContributor extension point every other plugin uses. */
function buildSyncIndexObjects(): IndexedObject[] {
  return getAllSyncJobs()
    .filter((job) => job.completedAt !== null)
    .map((job) => ({
      id: `sync-job:${job.id}`,
      type: "sync-job" as const,
      title: `${job.plugin} — ${job.type} sync (${job.status})`,
      description: `Imported ${job.itemsImported}, skipped ${job.itemsSkipped}, ignored ${job.duplicates} duplicate(s).`,
      keywords: [job.plugin, job.provider, job.type, job.status],
      date: job.completedAt?.slice(0, 10),
      tags: ["sync", job.type, job.status],
      metadata: { providerId: job.provider, jobId: job.id, status: job.status, type: job.type },
      createdAt: job.queuedAt,
      updatedAt: job.completedAt ?? job.queuedAt,
      searchableText: `${job.plugin} ${job.provider} ${job.type} ${job.status} sync`.toLowerCase(),
    }));
}

/** Structured, pre-computed facts only — the AI Financial Coach narrates
 * these counts, it never triggers or decides a synchronization itself
 * (see coach.ts's prompt guidance for the `sync` field). One summary per
 * provider's most recent completed job. */
function buildSyncCoachSummaries(): SyncCoachSummary[] {
  return getAllSyncProviders()
    .map((provider) => {
      const jobs = getSyncJobsByProvider(provider.id).filter((job) => job.completedAt !== null);
      if (jobs.length === 0) return null;
      const latest = jobs.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0];
      const summary: SyncCoachSummary = {
        providerName: provider.name,
        category: provider.category,
        itemsImported: latest.itemsImported,
        itemsSkipped: latest.itemsSkipped,
        duplicates: latest.duplicates,
        status: latest.status,
        completedAt: latest.completedAt,
      };
      return summary;
    })
    .filter((summary): summary is SyncCoachSummary => summary !== null);
}

registerFeedContributor(buildSyncFeedItems);
registerIndexContributor(buildSyncIndexObjects);
registerCoachSyncSummaryContributor(buildSyncCoachSummaries);
