/**
 * Job execution metrics — read-side aggregation over JobRun, consumed by
 * the /jobs dashboard. Per the task's constraint, no observability
 * provider (Sentry/OpenTelemetry) is wired here — this only collects and
 * exposes the fields those systems will eventually consume (duration,
 * correlation id, trace id). See docs/job-platform/08-worker-architecture.md §8.7.
 */
import "server-only";
import * as jobService from "@/services/jobs/job-service";
import type { JobStatusCounts, JobTypeMetrics } from "@/types/job";

export async function getJobTypeMetrics(windowHours = 24): Promise<JobTypeMetrics[]> {
  return jobService.getJobTypeMetrics(windowHours);
}

export async function getStatusCounts(organizationId?: string): Promise<JobStatusCounts> {
  return jobService.getStatusCounts(organizationId);
}

/** Queue depth, oldest-pending age, running count, dead-letter count —
 * the /jobs dashboard's top-line queue health row. */
export async function getQueueHealth() {
  return jobService.getQueueHealth();
}

/** Stale RUNNING rows past a per-job-type timeout (3x its rolling average
 * duration, floored at 10 minutes) — the stale-job reaper's candidate
 * list (docs/job-platform/06-scheduling-strategy.md §6.2). */
export async function findStaleJobs(): Promise<Array<{ id: string; jobType: string; inngestEventId: string }>> {
  const [stale, typeMetrics] = await Promise.all([
    jobService.findStaleRunning(10 * 60 * 1000),
    jobService.getJobTypeMetrics(24),
  ]);
  const avgByType = new Map(typeMetrics.map((m) => [m.jobType, m.avgDurationMs ?? 0]));

  const now = Date.now();
  return stale
    .filter((run) => {
      const threshold = Math.max(avgByType.get(run.jobType) ?? 0, 10 * 60 * 1000) * 3;
      const startedAt = run.startedAt ? new Date(run.startedAt).getTime() : now;
      return now - startedAt > threshold;
    })
    .map((run) => ({ id: run.id, jobType: run.jobType, inngestEventId: run.inngestEventId }));
}
