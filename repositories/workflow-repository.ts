/**
 * Workflow Repository — Postgres-backed persistence for
 * lib/workflows/registry.ts + lib/workflows/history.ts's successor.
 * WorkflowDefinition.key (the deterministic string, e.g.
 * "workflow:budget-exceeded") is the app-facing id everywhere below;
 * Prisma's own `id` (a cuid) only exists because the same key is seeded
 * into every organization and a globally-unique id can't do that.
 *
 * The app type's embedded, capped `executionHistory` array is NOT stored
 * on WorkflowDefinition here (unlike the old localStorage version) — it's
 * derived at read time from the real WorkflowRun table (already the full,
 * queryable log), avoiding a redundant copy of the same data.
 */
import { prisma } from "@/lib/db/prisma";
import { BUILT_IN_WORKFLOWS } from "@/lib/workflows/built-in-workflows";
import type {
  WorkflowDefinition as PrismaWorkflowDefinition,
  WorkflowRun as PrismaWorkflowRun,
  WorkflowRunStatus as PrismaWorkflowRunStatus,
  WorkflowStepResult as PrismaWorkflowStepResult,
} from "@/src/generated/prisma/client";
import type { Prisma } from "@/src/generated/prisma/client";
import type {
  WorkflowDefinition,
  WorkflowExecutionSummary,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowStepDefinition,
  WorkflowStepResult,
  WorkflowTrigger,
} from "@/types/workflow";

const MAX_EMBEDDED_HISTORY = 20;

const RUN_STATUS_TO_DB: Record<WorkflowRunStatus, PrismaWorkflowRunStatus> = {
  running: "RUNNING",
  completed: "COMPLETED",
  failed: "FAILED",
  partial: "PARTIAL",
};
const RUN_STATUS_FROM_DB: Record<PrismaWorkflowRunStatus, WorkflowRunStatus> = {
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  PARTIAL: "partial",
};

async function ensureSeeded(organizationId: string): Promise<void> {
  const count = await prisma.workflowDefinition.count({ where: { organizationId } });
  if (count > 0) return;
  await Promise.all(
    BUILT_IN_WORKFLOWS.map((workflow) =>
      prisma.workflowDefinition.upsert({
        where: { organizationId_key: { organizationId, key: workflow.key } },
        create: {
          key: workflow.key,
          organizationId,
          name: workflow.name,
          description: workflow.description,
          trigger: workflow.trigger,
          steps: JSON.parse(JSON.stringify(workflow.steps)),
          priority: workflow.priority,
        },
        update: {},
      }),
    ),
  );
}

async function deriveExecutionHistory(
  workflowRowId: string,
): Promise<WorkflowExecutionSummary[]> {
  const runs = await prisma.workflowRun.findMany({
    where: { workflowId: workflowRowId },
    orderBy: { startedAt: "desc" },
    take: MAX_EMBEDDED_HISTORY,
  });
  return runs.map((run) => ({
    runId: run.id,
    trigger: run.trigger as WorkflowTrigger,
    status: RUN_STATUS_FROM_DB[run.status],
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    durationMs: run.durationMs,
    successfulSteps: run.successfulSteps,
    failedSteps: run.failedSteps,
    retryCount: run.retryCount,
  }));
}

async function toWorkflowDefinition(row: PrismaWorkflowDefinition): Promise<WorkflowDefinition> {
  const executionHistory = await deriveExecutionHistory(row.id);
  return {
    id: row.key,
    name: row.name,
    description: row.description,
    trigger: row.trigger as WorkflowTrigger,
    steps: row.steps as unknown as WorkflowStepDefinition[],
    status: row.status === "ENABLED" ? "enabled" : "disabled",
    priority: row.priority,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastRun: (row.lastRunSummary as unknown as WorkflowExecutionSummary | null) ?? null,
    executionHistory,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    version: row.version,
  };
}

export async function getAllWorkflows(organizationId: string): Promise<WorkflowDefinition[]> {
  await ensureSeeded(organizationId);
  const rows = await prisma.workflowDefinition.findMany({ where: { organizationId } });
  return Promise.all(rows.map(toWorkflowDefinition));
}

export async function getWorkflowById(
  organizationId: string,
  key: string,
): Promise<WorkflowDefinition | undefined> {
  const row = await prisma.workflowDefinition.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  return row ? toWorkflowDefinition(row) : undefined;
}

/** Enabled and disabled workflows both come back — lib/workflows/runner.ts
 * is the one place that filters for "enabled" before executing. */
export async function getWorkflowsByTrigger(
  organizationId: string,
  trigger: WorkflowTrigger,
): Promise<WorkflowDefinition[]> {
  await ensureSeeded(organizationId);
  const rows = await prisma.workflowDefinition.findMany({
    where: { organizationId, trigger },
    orderBy: { priority: "desc" },
  });
  return Promise.all(rows.map(toWorkflowDefinition));
}

export async function enableWorkflow(
  organizationId: string,
  key: string,
): Promise<WorkflowDefinition | undefined> {
  const row = await prisma.workflowDefinition
    .update({ where: { organizationId_key: { organizationId, key } }, data: { status: "ENABLED" } })
    .catch(() => undefined);
  return row ? toWorkflowDefinition(row) : undefined;
}

export async function disableWorkflow(
  organizationId: string,
  key: string,
): Promise<WorkflowDefinition | undefined> {
  const row = await prisma.workflowDefinition
    .update({ where: { organizationId_key: { organizationId, key } }, data: { status: "DISABLED" } })
    .catch(() => undefined);
  return row ? toWorkflowDefinition(row) : undefined;
}

/** Bumps version — mirrors lib/workflows/registry.ts::updateWorkflow's
 * "Version" capability. */
export async function updateWorkflow(
  organizationId: string,
  key: string,
  patch: Partial<Pick<WorkflowDefinition, "name" | "description" | "steps" | "priority" | "metadata">>,
): Promise<WorkflowDefinition | undefined> {
  const row = await prisma.workflowDefinition
    .update({
      where: { organizationId_key: { organizationId, key } },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.steps !== undefined ? { steps: patch.steps as unknown as Prisma.InputJsonValue } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.metadata !== undefined ? { metadata: patch.metadata as Prisma.InputJsonValue } : {}),
        version: { increment: 1 },
      },
    })
    .catch(() => undefined);
  return row ? toWorkflowDefinition(row) : undefined;
}

/** Clones as disabled by default — two active workflows on the same
 * trigger would otherwise double every side effect the clone shares with
 * its source. The clone gets its own deterministic-ish key derived from
 * the source's, same shape lib/workflows/registry.ts::cloneWorkflow used. */
export async function cloneWorkflow(
  organizationId: string,
  key: string,
): Promise<WorkflowDefinition | undefined> {
  const source = await prisma.workflowDefinition.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  if (!source) return undefined;

  const clonedKey = `${source.key}:clone:${crypto.randomUUID()}`;
  const row = await prisma.workflowDefinition.create({
    data: {
      key: clonedKey,
      organizationId,
      name: `${source.name} (Copy)`,
      description: source.description,
      trigger: source.trigger,
      steps: source.steps as Prisma.InputJsonValue,
      status: "DISABLED",
      priority: source.priority,
      metadata: source.metadata as Prisma.InputJsonValue,
    },
  });
  return toWorkflowDefinition(row);
}

export async function deleteWorkflow(organizationId: string, key: string): Promise<void> {
  await prisma.workflowDefinition.deleteMany({ where: { organizationId, key } });
}

export async function clearWorkflows(organizationId: string): Promise<void> {
  await prisma.workflowDefinition.deleteMany({ where: { organizationId } });
}

/** Called after a run completes — updates the definition's lastRunSummary.
 * The capped embedded executionHistory the old registry.ts also updated
 * here is now derived at read time (see deriveExecutionHistory above), so
 * there's nothing else to write. */
export async function recordExecution(
  organizationId: string,
  key: string,
  summary: WorkflowExecutionSummary,
): Promise<WorkflowDefinition | undefined> {
  const row = await prisma.workflowDefinition
    .update({
      where: { organizationId_key: { organizationId, key } },
      data: { lastRunSummary: summary as unknown as Prisma.InputJsonValue },
    })
    .catch(() => undefined);
  return row ? toWorkflowDefinition(row) : undefined;
}

// --- run history (lib/workflows/history.ts's successor) --------------------

function toWorkflowRun(
  row: PrismaWorkflowRun & { steps: PrismaWorkflowStepResult[] },
  workflowName: string,
): WorkflowRun {
  return {
    runId: row.id,
    workflowId: row.workflowId,
    workflowName,
    trigger: row.trigger as WorkflowTrigger,
    status: RUN_STATUS_FROM_DB[row.status],
    steps: row.steps.map(
      (s): WorkflowStepResult => ({
        id: s.id,
        engine: s.engine as WorkflowStepResult["engine"],
        action: s.action,
        input: (s.input as Record<string, unknown>) ?? {},
        output: (s.output as Record<string, unknown> | null) ?? null,
        status: s.status as WorkflowStepResult["status"],
        startedAt: s.startedAt?.toISOString() ?? null,
        completedAt: s.completedAt?.toISOString() ?? null,
        duration: s.durationMs,
        error: s.error,
        retryCount: s.retryCount,
      }),
    ),
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    successfulSteps: row.successfulSteps,
    failedSteps: row.failedSteps,
    retryCount: row.retryCount,
    context: (row.context as Record<string, unknown>) ?? {},
  };
}

const includeSteps = { steps: true };

export async function getAllRuns(organizationId: string): Promise<WorkflowRun[]> {
  const rows = await prisma.workflowRun.findMany({
    where: { organizationId },
    include: { ...includeSteps, workflow: { select: { name: true } } },
    orderBy: { startedAt: "desc" },
  });
  return rows.map((row) => toWorkflowRun(row, row.workflow.name));
}

export async function getRunById(
  organizationId: string,
  runId: string,
): Promise<WorkflowRun | undefined> {
  const row = await prisma.workflowRun.findFirst({
    where: { id: runId, organizationId },
    include: { ...includeSteps, workflow: { select: { name: true } } },
  });
  return row ? toWorkflowRun(row, row.workflow.name) : undefined;
}

export async function getRunsByWorkflow(
  organizationId: string,
  workflowKey: string,
): Promise<WorkflowRun[]> {
  const definition = await prisma.workflowDefinition.findUnique({
    where: { organizationId_key: { organizationId, key: workflowKey } },
  });
  if (!definition) return [];
  const rows = await prisma.workflowRun.findMany({
    where: { workflowId: definition.id },
    include: includeSteps,
    orderBy: { startedAt: "desc" },
  });
  return rows.map((row) => toWorkflowRun(row, definition.name));
}

export async function getRunsByTrigger(
  organizationId: string,
  trigger: WorkflowTrigger,
): Promise<WorkflowRun[]> {
  const rows = await prisma.workflowRun.findMany({
    where: { organizationId, trigger },
    include: { ...includeSteps, workflow: { select: { name: true } } },
    orderBy: { startedAt: "desc" },
  });
  return rows.map((row) => toWorkflowRun(row, row.workflow.name));
}

/** Persists one full run (with its steps) — mirrors
 * lib/workflows/history.ts::recordRun, one $transaction so the run row and
 * its step rows commit together. Unlike the old capped-at-200-globally
 * array, Postgres has no row-count cap here; a future cleanup Inngest
 * function is the natural place to prune old rows (see the migration
 * plan's background job architecture), not this write path — matching the
 * same decision already made for repositories/sync-job-repository.ts. */
export async function recordRun(
  organizationId: string,
  workflowKey: string,
  run: WorkflowRun,
): Promise<void> {
  const definition = await prisma.workflowDefinition.findUniqueOrThrow({
    where: { organizationId_key: { organizationId, key: workflowKey } },
  });

  await prisma.$transaction(async (tx) => {
    await tx.workflowRun.upsert({
      where: { id: run.runId },
      create: {
        id: run.runId,
        workflowId: definition.id,
        organizationId,
        trigger: run.trigger,
        status: RUN_STATUS_TO_DB[run.status],
        startedAt: new Date(run.startedAt),
        completedAt: run.completedAt ? new Date(run.completedAt) : null,
        durationMs: run.durationMs,
        successfulSteps: run.successfulSteps,
        failedSteps: run.failedSteps,
        retryCount: run.retryCount,
        context: run.context as Prisma.InputJsonValue,
      },
      update: {
        status: RUN_STATUS_TO_DB[run.status],
        completedAt: run.completedAt ? new Date(run.completedAt) : null,
        durationMs: run.durationMs,
        successfulSteps: run.successfulSteps,
        failedSteps: run.failedSteps,
        retryCount: run.retryCount,
      },
    });

    // Steps are always the run's full, already-final set by the time
    // recordRun is called (see lib/workflows/runner.ts) — replace wholesale
    // rather than diff, same as reconcile-style writes elsewhere.
    await tx.workflowStepResult.deleteMany({ where: { workflowRunId: run.runId } });
    if (run.steps.length > 0) {
      await tx.workflowStepResult.createMany({
        data: run.steps.map((s) => ({
          // Step definition slugs (e.g. "detect-event") aren't globally
          // unique across runs, so this row gets its own Prisma-generated
          // cuid rather than reusing s.id.
          workflowRunId: run.runId,
          engine: s.engine,
          action: s.action,
          input: s.input as Prisma.InputJsonValue,
          output: s.output as Prisma.InputJsonValue,
          status: s.status,
          startedAt: s.startedAt ? new Date(s.startedAt) : null,
          completedAt: s.completedAt ? new Date(s.completedAt) : null,
          durationMs: s.duration,
          error: s.error,
          retryCount: s.retryCount,
        })),
      });
    }
  });
}

export async function clearHistory(organizationId: string): Promise<void> {
  await prisma.workflowRun.deleteMany({ where: { organizationId } });
}
