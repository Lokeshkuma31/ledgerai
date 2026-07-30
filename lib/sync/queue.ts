/**
 * Synchronization Queue — job ordering (FIFO), concurrency limits,
 * duplicate-job prevention, cancellation, and checkpoint carry-through.
 * Deliberately independent of lib/sync/history.ts (no persistence here) and
 * lib/sync/executor.ts (no execution here) — lib/sync/engine.ts is the
 * composition root that wires this queue's decisions to both, the same
 * separation lib/workflows/runner.ts keeps between its own inFlight
 * tracking and lib/workflows/executor.ts's actual execution.
 *
 * In-memory only, like lib/workflows/runner.ts's `inFlight` Set — a queued
 * or running job that never got recorded to history shouldn't survive a
 * reload as a ghost entry; only completed/failed/cancelled outcomes,
 * persisted by the caller via history.ts, do.
 */
import type { SyncJob, SyncJobType, SyncProvider } from "@/lib/sync/types";

const DEFAULT_CONCURRENCY_LIMIT = 2;

export interface EnqueueOptions {
  type: SyncJobType;
  /** Carried forward on a Resume/Retry — the provider picks up from here
   * instead of starting fresh. */
  checkpoint?: string | null;
  /** Bumped by the caller when re-enqueueing a retry; defaults to 0 for a
   * fresh job. */
  retryCount?: number;
  now?: Date;
}

function createJob(provider: SyncProvider, options: EnqueueOptions): SyncJob {
  const now = options.now ?? new Date();
  return {
    id: crypto.randomUUID(),
    provider: provider.id,
    plugin: provider.name,
    type: options.type,
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
    retryCount: options.retryCount ?? 0,
    lastCheckpoint: options.checkpoint ?? null,
    metadata: {},
    queuedAt: now.toISOString(),
  };
}

export class SyncQueue {
  private concurrencyLimit = DEFAULT_CONCURRENCY_LIMIT;
  private pending: SyncJob[] = [];
  private running = new Map<string, SyncJob>();
  private controllers = new Map<string, AbortController>();

  setConcurrencyLimit(limit: number): void {
    this.concurrencyLimit = Math.max(1, limit);
  }

  getConcurrencyLimit(): number {
    return this.concurrencyLimit;
  }

  /** A provider with a job already queued or running never gets a second
   * one — "Prevent duplicate jobs" from the spec. */
  hasActiveJob(providerId: string): boolean {
    return (
      this.pending.some((job) => job.provider === providerId) ||
      Array.from(this.running.values()).some((job) => job.provider === providerId)
    );
  }

  /** Adds a new job to the back of the queue. Returns undefined (enqueuing
   * nothing) if the provider already has an active job. */
  enqueue(provider: SyncProvider, options: EnqueueOptions): SyncJob | undefined {
    if (this.hasActiveJob(provider.id)) return undefined;
    const job = createJob(provider, options);
    this.pending.push(job);
    return job;
  }

  /** Re-adds an existing job (a Retry or a Resume) to the back of the
   * queue — the caller is responsible for having already reset its status
   * to "queued" and, for a retry, bumped retryCount. */
  requeue(job: SyncJob): void {
    this.pending.push({ ...job, status: "queued" });
  }

  canRunMore(): boolean {
    return this.running.size < this.concurrencyLimit;
  }

  /** Pops the next queued job in FIFO order if under the concurrency
   * limit; otherwise undefined. */
  dequeueNext(): SyncJob | undefined {
    if (!this.canRunMore() || this.pending.length === 0) return undefined;
    return this.pending.shift();
  }

  /** Moves a dequeued job into "running" and returns the AbortController
   * its execution should watch for cancellation. */
  markRunning(job: SyncJob): AbortController {
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    this.running.set(job.id, job);
    return controller;
  }

  /** Refreshes the in-memory snapshot of a running job (e.g. after the
   * executor resolves) — callers still need markFinished to actually
   * retire it from the running set. */
  updateRunning(job: SyncJob): void {
    if (this.running.has(job.id)) this.running.set(job.id, job);
  }

  markFinished(jobId: string): void {
    this.running.delete(jobId);
    this.controllers.delete(jobId);
  }

  /** Cooperative cancellation: aborts a running job's signal, or removes a
   * not-yet-started job from the pending queue. Returns false if no job
   * with that id was found in either place. */
  cancel(jobId: string): boolean {
    const controller = this.controllers.get(jobId);
    if (controller) {
      controller.abort();
      return true;
    }
    const index = this.pending.findIndex((job) => job.id === jobId);
    if (index !== -1) {
      this.pending.splice(index, 1);
      return true;
    }
    return false;
  }

  /** Removes a queued (not yet running) job without cancelling anything —
   * used when a duplicate-prevention check needs to make room, or by tests. */
  removeQueued(jobId: string): boolean {
    const index = this.pending.findIndex((job) => job.id === jobId);
    if (index === -1) return false;
    this.pending.splice(index, 1);
    return true;
  }

  getQueued(): SyncJob[] {
    return [...this.pending];
  }

  getRunning(): SyncJob[] {
    return Array.from(this.running.values());
  }

  size(): number {
    return this.pending.length;
  }
}

export const syncQueue = new SyncQueue();
