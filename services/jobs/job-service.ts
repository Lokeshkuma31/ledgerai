/**
 * Job Service — thin pass-through to repositories/job-repository.ts,
 * following the same "services/* is the only caller of repositories/*"
 * convention as every other domain. lib/jobs/worker.ts, lib/jobs/
 * dead-letter.ts, lib/jobs/metrics.ts, and the /jobs dashboard's Route
 * Handlers are the callers here — Inngest functions in
 * lib/jobs/functions/*.ts never import repositories/job-repository.ts
 * directly.
 */
import * as jobRepository from "@/repositories/job-repository";
import type { CreateDeadLetterInput, CreateQueuedInput, JobKey } from "@/repositories/job-repository";
import type { JobDeadLetter, JobRun, JobStatus, JobStatusCounts, JobTypeMetrics } from "@/types/job";

export type { JobKey };

export async function createQueued(data: CreateQueuedInput): Promise<JobRun> {
  return jobRepository.createQueued(data);
}

export async function markRunning(key: JobKey, inngestRunId: string, attempt: number): Promise<JobRun> {
  return jobRepository.markRunning(key, inngestRunId, attempt);
}

export async function markRetrying(key: JobKey, attempt: number, error: unknown): Promise<JobRun> {
  return jobRepository.markRetrying(key, attempt, error);
}

export async function markCompleted(key: JobKey, output?: unknown): Promise<JobRun> {
  return jobRepository.markCompleted(key, output);
}

export async function markFailed(key: JobKey, error: unknown, attempt: number): Promise<JobRun> {
  return jobRepository.markFailed(key, error, attempt);
}

export async function markCancelled(key: JobKey): Promise<JobRun> {
  return jobRepository.markCancelled(key);
}

export async function markDeadLetter(key: JobKey): Promise<JobRun> {
  return jobRepository.markDeadLetter(key);
}

export async function setProgress(key: JobKey, progress: number): Promise<void> {
  return jobRepository.setProgress(key, progress);
}

export async function getRunByKey(key: JobKey): Promise<JobRun | undefined> {
  return jobRepository.getByKey(key);
}

export async function getRunById(id: string): Promise<JobRun | undefined> {
  return jobRepository.getById(id);
}

export async function listRecentRuns(params: {
  organizationId?: string;
  jobType?: string;
  status?: JobStatus;
  correlationId?: string;
  limit?: number;
}): Promise<JobRun[]> {
  return jobRepository.listRecent(params);
}

export async function getStatusCounts(organizationId?: string): Promise<JobStatusCounts> {
  return jobRepository.countsByStatus(organizationId);
}

export async function getJobTypeMetrics(windowHours = 24): Promise<JobTypeMetrics[]> {
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  return jobRepository.getJobTypeMetrics(windowStart);
}

export async function getQueueHealth() {
  const [counts, oldestPendingAgeMs] = await Promise.all([
    jobRepository.countsByStatus(),
    jobRepository.getOldestPendingAgeMs(),
  ]);
  return {
    queueDepth: counts.QUEUED + counts.SCHEDULED,
    oldestPendingAgeMs,
    runningCount: counts.RUNNING,
    deadLetterCount: counts.DEAD_LETTER,
  };
}

export async function findStaleRunning(olderThanMs: number): Promise<JobRun[]> {
  return jobRepository.findStaleRunning(new Date(Date.now() - olderThanMs));
}

// --- dead letters ------------------------------------------------------------

export async function createDeadLetter(data: CreateDeadLetterInput): Promise<JobDeadLetter> {
  return jobRepository.createDeadLetter(data);
}

export async function listDeadLetters(params: {
  organizationId?: string;
  includeResolved?: boolean;
  limit?: number;
}): Promise<JobDeadLetter[]> {
  return jobRepository.listDeadLetters(params);
}

export async function getDeadLetterById(id: string): Promise<JobDeadLetter | undefined> {
  return jobRepository.getDeadLetterById(id);
}

export async function resolveDeadLetter(id: string, resolvedBy: string): Promise<JobDeadLetter> {
  return jobRepository.resolveDeadLetter(id, resolvedBy);
}

export async function countUnresolvedDeadLetters(organizationId?: string): Promise<number> {
  return jobRepository.countUnresolvedDeadLetters(organizationId);
}
