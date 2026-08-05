/** The background job platform's own execution-tracking domain types —
 * see docs/job-platform/08-worker-architecture.md §8.2. Distinct from
 * SyncJob/WorkflowRun (business records of "this operation ran"): JobRun
 * tracks the Inngest execution underneath any job type. */
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

export interface JobRun {
  id: string;
  jobType: string;
  eventName: string;
  inngestEventId: string;
  inngestRunId: string | null;
  organizationId: string | null;
  status: JobStatus;
  attempt: number;
  progress: number | null;
  correlationId: string;
  traceId: string | null;
  input: unknown;
  output: unknown;
  error: unknown;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  relatedIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface JobDeadLetter {
  id: string;
  jobRunId: string;
  jobType: string;
  organizationId: string | null;
  eventPayload: unknown;
  error: unknown;
  originalRunId: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  retryOfId: string | null;
  createdAt: string;
  jobRun?: JobRun;
}

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

export interface JobStatusCounts {
  QUEUED: number;
  SCHEDULED: number;
  RUNNING: number;
  RETRYING: number;
  COMPLETED: number;
  FAILED: number;
  CANCELLED: number;
  DEAD_LETTER: number;
}
