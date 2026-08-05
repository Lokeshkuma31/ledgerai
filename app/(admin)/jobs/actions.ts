"use server";

import { revalidatePath } from "next/cache";
import { requireUserId, getCurrentMembership } from "@/lib/auth/session";
import { retryDeadLetter as retryDeadLetterJob } from "@/lib/jobs/dead-letter";
import { dispatch } from "@/lib/jobs/dispatcher";
import * as jobService from "@/services/jobs/job-service";

async function requireOwner() {
  const userId = await requireUserId();
  const membership = await getCurrentMembership();
  if (!membership || membership.role !== "OWNER") throw new Error("Forbidden");
  return userId;
}

/** Re-dispatches a dead-lettered job's original event via
 * lib/jobs/dead-letter.ts::retryDeadLetter — see
 * docs/job-platform/05-retry-strategy.md §5.6. */
export async function retryDeadLetterAction(deadLetterId: string): Promise<void> {
  const userId = await requireOwner();
  await retryDeadLetterJob(deadLetterId, userId);
  revalidatePath("/jobs");
}

/** Cancels an in-flight job — dispatches the cancellation-matching event
 * (only sync-run currently declares cancelOn, see lib/jobs/functions/
 * sync.ts... wait, no — see the caller for which jobs support this) and
 * marks the JobRun row CANCELLED directly, since Inngest's own
 * cancellation doesn't call back application code (see
 * docs/job-platform/08-worker-architecture.md §8.5). */
export async function cancelJobAction(jobRunId: string): Promise<void> {
  await requireOwner();
  const run = await jobService.getRunById(jobRunId);
  if (!run) return;

  if (run.jobType === "sync-run") {
    const data = run.input as { connectionId?: string } | null;
    if (data?.connectionId) {
      await dispatch("ledger/connection.disconnected", {
        organizationId: run.organizationId ?? undefined,
        connectionId: data.connectionId,
        provider: "unknown",
      });
    }
  }
  await jobService.markCancelled({ jobType: run.jobType, inngestEventId: run.inngestEventId });
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobRunId}`);
}
