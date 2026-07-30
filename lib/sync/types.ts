/**
 * Shared types for the Unified Synchronization Engine. Every other file in
 * lib/sync/ depends only on this file — it never depends on them, so this
 * stays the engine's single source of truth for its data shapes. Mirrors
 * lib/banks/types.ts and lib/workflows (types/workflow.ts)'s own
 * single-source-of-truth split.
 *
 * The engine is provider-agnostic: it knows the SyncProvider contract
 * below and nothing about Gmail, a specific bank, SMS parsing, or OCR.
 * Every provider-specific detail (what "incremental" means for that
 * provider, how duplicates are actually detected) is delegated to the
 * provider's own sync() implementation — this file only shapes the
 * request/response envelope around that call.
 */

/** Every category of connected provider the spec names, plus "other" for
 * a future plugin that doesn't fit the named ones. Open-ended by design —
 * a new category never requires a change here, since SyncProviderCategory
 * is only used for grouping/labeling in the dashboard. */
export const SYNC_PROVIDER_CATEGORIES = ["email", "bank", "sms", "document", "other"] as const;
export type SyncProviderCategory = (typeof SYNC_PROVIDER_CATEGORIES)[number];

/** Every stage of the Sync Lifecycle the spec asks for. "resume" and
 * "retry" are distinct from "initial"/"incremental": they carry forward a
 * prior job's cursor/checkpoint rather than starting fresh. */
export const SYNC_JOB_TYPES = ["initial", "incremental", "manual", "scheduled", "resume", "retry"] as const;
export type SyncJobType = (typeof SYNC_JOB_TYPES)[number];

export const SYNC_JOB_STATUSES = [
  "queued",
  "running",
  "paused",
  "completed",
  "partial",
  "failed",
  "cancelled",
] as const;
export type SyncJobStatus = (typeof SYNC_JOB_STATUSES)[number];

export const SYNC_SCHEDULE_FREQUENCIES = ["manual", "15min", "hourly", "daily", "weekly", "disabled"] as const;
export type SyncScheduleFrequency = (typeof SYNC_SCHEDULE_FREQUENCIES)[number];

export interface SyncIssue {
  message: string;
  at: string; // ISO 8601
}

/** One entry in the Sync Job Model — the spec's exact field list. Mirrors
 * lib/banks/types.ts's SyncRun and lib/workflows (types/workflow.ts)'s
 * WorkflowRun in spirit: a complete, traceable record of one sync attempt,
 * whichever provider it belongs to. */
export interface SyncJob {
  id: string;
  provider: string; // SyncProvider.id
  plugin: string; // human-readable plugin/provider name, for display without a registry lookup
  type: SyncJobType;
  status: SyncJobStatus;
  startedAt: string | null; // ISO 8601 — null while still queued
  completedAt: string | null; // ISO 8601
  duration: number | null; // milliseconds
  itemsDiscovered: number;
  itemsImported: number;
  itemsSkipped: number;
  duplicates: number;
  errors: SyncIssue[];
  warnings: SyncIssue[];
  retryCount: number;
  /** Provider-defined opaque progress marker — lets a cancelled/failed job
   * resume from where it left off instead of restarting. Null once a job
   * has fully caught up. */
  lastCheckpoint: string | null;
  metadata: Record<string, unknown>;
  /** When this job was enqueued — distinct from startedAt (queue wait time
   * vs. execution time), needed for queue ordering. */
  queuedAt: string; // ISO 8601
}

/** A provider's own position in its data stream — lastSyncToken, lastCursor,
 * lastMessageId, lastTransactionId, or whatever else fits that provider's
 * API, all represented the same opaque-string way so the engine never
 * needs to know which one a given provider actually uses. */
export interface SyncCursor {
  value: string | null;
  updatedAt: string; // ISO 8601
}

/** Cooperative cancellation signal handed to a provider's sync() — the
 * engine can't force-stop an in-flight async call, but a well-behaved
 * provider checks `signal.aborted` between batches and stops early,
 * returning whatever partial result it has (with a checkpoint so the next
 * run resumes cleanly). */
export interface SyncExecutionInput {
  mode: SyncJobType;
  cursor: SyncCursor | null;
  checkpoint: string | null;
  signal: AbortSignal;
}

export interface SyncExecutionResult {
  itemsDiscovered: number;
  itemsImported: number;
  itemsSkipped: number;
  duplicates: number;
  errors: SyncIssue[];
  warnings: SyncIssue[];
  /** The provider's new position after this run — null means "start over
   * next time" (rare; most providers always return an advancing cursor). */
  nextCursor: SyncCursor | null;
  /** Set when the run stopped before reaching the end of available data
   * (cancelled, or a self-imposed batch limit) — lets resumeSync continue
   * from here. Null once the provider is fully caught up. */
  checkpoint: string | null;
  metadata?: Record<string, unknown>;
}

export interface SyncProviderHealthSnapshot {
  status: "healthy" | "degraded" | "offline" | "unknown";
  message: string;
  checkedAt: string; // ISO 8601
}

/**
 * The contract every connected provider (Email, Bank, SMS, Document,
 * future plugin) implements to register with the Sync Engine instead of
 * running its own synchronization loop. A provider's sync() is expected to
 * delegate its actual fetch/parse/duplicate-detection work to that
 * provider's own already-existing service (e.g. lib/banks/sync-engine.ts's
 * runSync, lib/email/engine.ts's runEmailSync) — this engine only
 * schedules, queues, retries, and records the outcome; it never
 * re-implements a provider's own sync logic.
 */
export interface SyncProvider {
  id: string;
  name: string;
  category: SyncProviderCategory;
  /** The provider's own suggestion for how often it should run on a
   * schedule — the dashboard's Schedule Editor defaults to this but the
   * user can override it per-provider (see registry.ts). */
  recommendedSchedule: SyncScheduleFrequency;
  supportsIncremental: boolean;
  /** Null when the provider has never successfully synced. */
  getCursor(): SyncCursor | null;
  sync(input: SyncExecutionInput): Promise<SyncExecutionResult>;
  health(): Promise<SyncProviderHealthSnapshot>;
}

export interface SyncProviderSchedule {
  frequency: SyncScheduleFrequency;
  /** ISO 8601 — computed by scheduler.ts, not hand-set. */
  nextRunAt: string | null;
}

export interface SyncQueueSnapshot {
  queued: SyncJob[];
  running: SyncJob[];
  concurrencyLimit: number;
}

export interface SyncProviderHealth {
  providerId: string;
  providerName: string;
  category: SyncProviderCategory;
  queueSize: number;
  runningJobs: number;
  failedJobs: number;
  averageSyncTimeMs: number;
  averageItemsImported: number;
  /** 0-1. */
  successRate: number;
  lastSuccessfulSyncAt: string | null;
  connection: SyncProviderHealthSnapshot;
}

export interface SyncEngineHealth {
  queueSize: number;
  runningJobs: number;
  failedJobs: number;
  averageSyncTimeMs: number;
  averageItemsImported: number;
  successRate: number;
  lastSuccessfulSyncAt: string | null;
  byProvider: SyncProviderHealth[];
}

export const CONFLICT_TYPES = [
  "duplicate-transaction",
  "updated-transaction",
  "deleted-item",
  "provider-version-change",
  "timestamp-conflict",
] as const;
export type ConflictType = (typeof CONFLICT_TYPES)[number];

export interface ConflictRecord {
  type: ConflictType;
  itemId: string;
  detail: string;
  resolvedAs: "kept-existing" | "kept-incoming" | "merged" | "skipped";
  detectedAt: string; // ISO 8601
}

/** What the AI Financial Coach receives — already-executed sync jobs. The
 * Coach only narrates these; it never triggers or decides a sync itself,
 * and never re-derives item counts from raw provider data. */
export interface SyncCoachSummary {
  providerName: string;
  category: SyncProviderCategory;
  type: SyncJobType;
  status: SyncJobStatus;
  itemsImported: number;
  itemsSkipped: number;
  duplicates: number;
  completedAt: string | null;
}
