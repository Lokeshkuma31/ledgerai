import { executeWorkflow } from "@/lib/workflows/executor";
import { recordRun } from "@/lib/workflows/history";
import { getWorkflowById, getWorkflowsByTrigger, recordExecution } from "@/lib/workflows/registry";
import type { StepContext } from "@/lib/workflows/step";
import type { WorkflowExecutionSummary, WorkflowRun, WorkflowTrigger } from "@/types/workflow";

/** In-memory only (per browser session) — tracks which workflow ids
 * currently have a run in flight, so a trigger firing again before the
 * previous run finished doesn't launch a second concurrent execution of
 * the same workflow. Intentionally not persisted: a stale "in progress"
 * flag should never survive a reload. */
const inFlight = new Set<string>();

function toSummary(run: WorkflowRun): WorkflowExecutionSummary {
  return {
    runId: run.runId,
    trigger: run.trigger,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: run.durationMs,
    successfulSteps: run.successfulSteps,
    failedSteps: run.failedSteps,
    retryCount: run.retryCount,
  };
}

async function runAndRecord(
  workflowId: string,
  context: StepContext,
  trigger: WorkflowTrigger,
  now: Date,
): Promise<WorkflowRun | undefined> {
  const definition = getWorkflowById(workflowId);
  if (!definition) return undefined;
  if (inFlight.has(definition.id)) return undefined;

  inFlight.add(definition.id);
  try {
    const run = await executeWorkflow(definition, context, trigger, now);
    recordRun(run);
    recordExecution(definition.id, toSummary(run));
    return run;
  } finally {
    inFlight.delete(definition.id);
  }
}

/**
 * The Workflow Runner — runs every enabled workflow registered for
 * `trigger`, in priority order. Each workflow is independent: one failing
 * doesn't stop the others, and one already running (see isWorkflowRunning)
 * is skipped rather than queued, preventing duplicate concurrent execution.
 */
export async function runWorkflowsForTrigger(
  trigger: WorkflowTrigger,
  context: StepContext,
  now: Date = new Date(),
): Promise<WorkflowRun[]> {
  const candidates = getWorkflowsByTrigger(trigger).filter((w) => w.status === "enabled");
  const runs: WorkflowRun[] = [];
  for (const definition of candidates) {
    const run = await runAndRecord(definition.id, context, trigger, now);
    if (run) runs.push(run);
  }
  return runs;
}

/** Runs one specific workflow on demand, regardless of its configured
 * trigger — used by the Workflows dashboard's "Run Now" action. The
 * resulting run is recorded with trigger "manual-run", since that's what
 * actually caused this particular execution. */
export async function runWorkflowById(
  workflowId: string,
  context: StepContext,
  now: Date = new Date(),
): Promise<WorkflowRun | undefined> {
  return runAndRecord(workflowId, context, "manual-run", now);
}

export function isWorkflowRunning(workflowId: string): boolean {
  return inFlight.has(workflowId);
}
