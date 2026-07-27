import { getStepHandler, type StepContext } from "@/lib/workflows/step";
import type { WorkflowDefinition, WorkflowRun, WorkflowStepResult, WorkflowTrigger } from "@/types/workflow";

const MAX_RETRIES = 2;

/** Keeps WorkflowRun.context small and JSON-safe regardless of what the
 * caller threads through for step handlers (which can include full
 * transaction arrays) — history entries store a shape summary, not the
 * raw data, so localStorage doesn't balloon with duplicated app state. */
function summarizeContext(context: StepContext): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      summary[key] = value;
    } else if (value instanceof Date) {
      summary[key] = value.toISOString();
    } else if (Array.isArray(value)) {
      summary[key] = `${value.length} item(s)`;
    } else if (typeof value === "object") {
      summary[key] = "object";
    }
  }
  return summary;
}

async function executeStep(
  stepDef: WorkflowDefinition["steps"][number],
  context: StepContext,
): Promise<WorkflowStepResult> {
  const handler = getStepHandler(stepDef.engine, stepDef.action);
  const base = {
    id: stepDef.id,
    engine: stepDef.engine,
    action: stepDef.action,
    input: {} as Record<string, unknown>,
  };

  if (!handler) {
    const at = new Date().toISOString();
    return {
      ...base,
      output: null,
      status: "failed",
      startedAt: at,
      completedAt: at,
      duration: 0,
      error: `No step handler registered for ${stepDef.engine}:${stepDef.action}.`,
      retryCount: 0,
    };
  }

  const startedAt = new Date();
  let attempt = 0;
  let lastError: string | null = null;

  while (attempt <= MAX_RETRIES) {
    try {
      const output = await handler(context, {});
      const completedAt = new Date();
      return {
        ...base,
        output,
        status: "completed",
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        duration: completedAt.getTime() - startedAt.getTime(),
        error: null,
        retryCount: attempt,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      attempt += 1;
    }
  }

  const completedAt = new Date();
  return {
    ...base,
    output: null,
    status: "failed",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    duration: completedAt.getTime() - startedAt.getTime(),
    error: lastError,
    retryCount: attempt - 1,
  };
}

/**
 * Runs one workflow's steps in sequence. Each step is independent (per
 * the spec's example): a failed step (after retrying up to MAX_RETRIES
 * times) doesn't stop the run — execution continues to the next step, and
 * the overall run status reflects the mix ("completed" only if every step
 * completed, "failed" if every step failed, "partial" otherwise).
 *
 * `now` is merged into the step context so every engine call a step makes
 * is deterministic; step timing (startedAt/completedAt/duration) uses real
 * wall-clock time, since that's a genuine execution-latency measurement,
 * not business logic.
 */
export async function executeWorkflow(
  definition: WorkflowDefinition,
  context: StepContext,
  trigger: WorkflowTrigger,
  now: Date = new Date(),
): Promise<WorkflowRun> {
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const runContext: StepContext = { ...context, now };

  const steps: WorkflowStepResult[] = [];
  for (const stepDef of definition.steps) {
    steps.push(await executeStep(stepDef, runContext));
  }

  const completedAt = new Date();
  const successfulSteps = steps.filter((s) => s.status === "completed").length;
  const failedSteps = steps.filter((s) => s.status === "failed").length;
  const retryCount = steps.reduce((sum, s) => sum + s.retryCount, 0);

  const status: WorkflowRun["status"] =
    failedSteps === 0 ? "completed" : successfulSteps === 0 ? "failed" : "partial";

  return {
    runId,
    workflowId: definition.id,
    workflowName: definition.name,
    trigger,
    status,
    steps,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    successfulSteps,
    failedSteps,
    retryCount,
    context: summarizeContext(context),
  };
}
