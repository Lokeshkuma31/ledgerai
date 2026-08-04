/**
 * Workflow Service — the async, Postgres-backed successor to
 * lib/workflows/registry.ts + lib/workflows/history.ts, following the
 * repositories/+services/ split established for every other domain.
 */
import * as workflowRepository from "@/repositories/workflow-repository";
import type {
  WorkflowDefinition,
  WorkflowExecutionSummary,
  WorkflowRun,
  WorkflowTrigger,
} from "@/types/workflow";
import {
  updateWorkflowInputSchema,
  type UpdateWorkflowInput,
} from "./workflow-schema";

export async function listWorkflows(organizationId: string): Promise<WorkflowDefinition[]> {
  return workflowRepository.getAllWorkflows(organizationId);
}

export async function getWorkflowById(
  organizationId: string,
  key: string,
): Promise<WorkflowDefinition | undefined> {
  return workflowRepository.getWorkflowById(organizationId, key);
}

export async function getWorkflowsByTrigger(
  organizationId: string,
  trigger: WorkflowTrigger,
): Promise<WorkflowDefinition[]> {
  return workflowRepository.getWorkflowsByTrigger(organizationId, trigger);
}

export async function enableWorkflow(
  organizationId: string,
  key: string,
): Promise<WorkflowDefinition | undefined> {
  return workflowRepository.enableWorkflow(organizationId, key);
}

export async function disableWorkflow(
  organizationId: string,
  key: string,
): Promise<WorkflowDefinition | undefined> {
  return workflowRepository.disableWorkflow(organizationId, key);
}

export async function updateWorkflow(
  organizationId: string,
  input: UpdateWorkflowInput,
): Promise<WorkflowDefinition | undefined> {
  const { key, ...patch } = updateWorkflowInputSchema.parse(input);
  return workflowRepository.updateWorkflow(organizationId, key, patch);
}

export async function cloneWorkflow(
  organizationId: string,
  key: string,
): Promise<WorkflowDefinition | undefined> {
  return workflowRepository.cloneWorkflow(organizationId, key);
}

export async function deleteWorkflow(organizationId: string, key: string): Promise<void> {
  return workflowRepository.deleteWorkflow(organizationId, key);
}

export async function recordExecution(
  organizationId: string,
  key: string,
  summary: WorkflowExecutionSummary,
): Promise<WorkflowDefinition | undefined> {
  return workflowRepository.recordExecution(organizationId, key, summary);
}

// --- run history -------------------------------------------------------------

export async function listRuns(organizationId: string): Promise<WorkflowRun[]> {
  return workflowRepository.getAllRuns(organizationId);
}

export async function getRunById(
  organizationId: string,
  runId: string,
): Promise<WorkflowRun | undefined> {
  return workflowRepository.getRunById(organizationId, runId);
}

export async function getRunsByWorkflow(
  organizationId: string,
  workflowKey: string,
): Promise<WorkflowRun[]> {
  return workflowRepository.getRunsByWorkflow(organizationId, workflowKey);
}

export async function getRunsByTrigger(
  organizationId: string,
  trigger: WorkflowTrigger,
): Promise<WorkflowRun[]> {
  return workflowRepository.getRunsByTrigger(organizationId, trigger);
}

/** Persists a completed run and updates its definition's lastRunSummary in
 * the same call, mirroring how lib/workflows/runner.ts always calls
 * lib/workflows/history.ts::recordRun and lib/workflows/registry.ts::
 * recordExecution together at the end of a run. */
export async function recordRun(
  organizationId: string,
  workflowKey: string,
  run: WorkflowRun,
): Promise<void> {
  await workflowRepository.recordRun(organizationId, workflowKey, run);
  await workflowRepository.recordExecution(organizationId, workflowKey, {
    runId: run.runId,
    trigger: run.trigger,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: run.durationMs,
    successfulSteps: run.successfulSteps,
    failedSteps: run.failedSteps,
    retryCount: run.retryCount,
  });
}
