/**
 * Dead-letter queue — routes permanently-failed jobs to JobDeadLetter for
 * inspection, and re-dispatches them on manual retry. See
 * docs/job-platform/05-retry-strategy.md §5.5-5.6.
 */
import "server-only";
import * as jobService from "@/services/jobs/job-service";
import type { DeadLetterInput } from "./types";
import { dispatch } from "./dispatcher";
import type { EventName } from "./events";

export async function routeToDeadLetter(input: DeadLetterInput): Promise<void> {
  await jobService.createDeadLetter({
    jobRunId: input.jobRunId,
    jobType: input.jobType,
    organizationId: input.organizationId,
    eventPayload: input.eventPayload,
    error: input.error,
    originalRunId: input.originalRunId,
    retryOfId: input.retryOfId,
  });
  await jobService.markDeadLetter({ jobType: input.jobType, inngestEventId: extractEventId(input.eventPayload) });
}

function extractEventId(eventPayload: unknown): string {
  const payload = eventPayload as { id?: string } | undefined;
  return payload?.id ?? "";
}

/** Re-dispatches a dead-lettered job's original event with a fresh
 * Inngest event id (the original id would just be deduped away, see
 * docs/job-platform/04-queue-strategy.md §4.6) and marks the dead-letter
 * row resolved. If the retry also fails, a *new* JobDeadLetter row is
 * created rather than reopening this one — preserves a full audit trail,
 * matching AuditLog/SyncHistoryEvent's append-only pattern. See
 * docs/job-platform/05-retry-strategy.md §5.6. */
export async function retryDeadLetter(deadLetterId: string, resolvedBy: string): Promise<void> {
  const entry = await jobService.getDeadLetterById(deadLetterId);
  if (!entry) throw new Error(`Dead-letter entry not found: ${deadLetterId}`);

  const original = entry.eventPayload as { name: string; data: Record<string, unknown> };
  await dispatch(original.name as EventName, { ...original.data, retryOf: deadLetterId } as never);
  await jobService.resolveDeadLetter(deadLetterId, resolvedBy);
}
