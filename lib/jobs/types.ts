/**
 * Central type definitions for the background job platform. Nothing here
 * imports Inngest or Prisma directly — this module is the shared
 * vocabulary every other lib/jobs/* module (and services/jobs/*) is
 * written against, per docs/job-platform/08-worker-architecture.md.
 */

/** Mirrors prisma's JobStatus enum (see prisma/schema.prisma's JobRun
 * model) — duplicated here rather than imported from the generated Prisma
 * client so lib/jobs/* files that don't otherwise need Prisma types (e.g.
 * queue.ts, retry.ts) stay decoupled from the generated client. */
export const JOB_STATUSES = [
  "QUEUED",
  "SCHEDULED",
  "RUNNING",
  "RETRYING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "DEAD_LETTER",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** transient: safe to let Inngest retry automatically. permanent: retrying
 * with the same input will not change the outcome — routed to dead-letter
 * immediately via NonRetriableError. See docs/job-platform/05-retry-strategy.md. */
export type ErrorClassification = "transient" | "permanent";

/** Every event dispatched through lib/jobs/dispatcher.ts carries this
 * envelope. `correlationId` threads a full chain (e.g. EmailImported -> ...
 * -> SearchIndexed) together across independent Inngest function runs —
 * see docs/job-platform/08-worker-architecture.md §8.4. */
export interface JobEventEnvelope {
  organizationId?: string;
  correlationId: string;
  priority?: "interactive" | "normal";
  /** Set by dead-letter.ts::retryDeadLetter() when re-dispatching a failed
   * event — traces a manual retry back to the JobDeadLetter row that
   * triggered it. */
  retryOf?: string;
}

export type JobEventData<T extends Record<string, unknown> = Record<string, unknown>> =
  JobEventEnvelope & T;

/** The subset of Inngest's function-context fields lib/jobs/* code reads,
 * kept as our own interface so business-facing modules (functions/*.ts)
 * don't need Inngest's own types imported everywhere. */
export interface JobRunContext {
  eventId: string;
  eventName: string;
  runId: string;
  attempt: number;
}

export interface JobTrackingInput {
  jobType: string;
  eventName: string;
  inngestEventId: string;
  inngestRunId?: string;
  organizationId?: string;
  correlationId: string;
  input?: unknown;
  relatedIds?: string[];
}

export interface JobFailureInput {
  inngestEventId: string;
  error: unknown;
  classification: ErrorClassification;
  willRetry: boolean;
}

export interface JobCompletionInput {
  inngestEventId: string;
  output?: unknown;
}

export interface DeadLetterInput {
  jobRunId: string;
  jobType: string;
  organizationId?: string;
  eventPayload: unknown;
  error: unknown;
  originalRunId: string;
  retryOfId?: string;
}

/** Aggregated numbers the /jobs dashboard reads — see
 * docs/job-platform/08-worker-architecture.md §8.7. */
export interface JobTypeMetrics {
  jobType: string;
  avgDurationMs: number | null;
  successRate: number | null;
  failureRate: number | null;
  avgAttempts: number | null;
  avgQueueLatencyMs: number | null;
  runningCount: number;
  queuedCount: number;
  completedCount: number;
  failedCount: number;
  deadLetterCount: number;
}

export interface QueueHealthSnapshot {
  queueDepth: number;
  oldestPendingAgeMs: number | null;
  runningCount: number;
  deadLetterCount: number;
}
