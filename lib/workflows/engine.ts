import { getAllRuns } from "@/lib/workflows/history";
import { getAllWorkflows } from "@/lib/workflows/registry";
import type { WorkflowStatistics } from "@/types/workflow";

export { runWorkflowById, runWorkflowsForTrigger, isWorkflowRunning } from "@/lib/workflows/runner";
export {
  getAllWorkflows,
  getWorkflowById,
  cloneWorkflow,
  enableWorkflow,
  disableWorkflow,
  updateWorkflow,
  deleteWorkflow,
} from "@/lib/workflows/registry";
export { getAllRuns, getRunById, getRunsByWorkflow } from "@/lib/workflows/history";

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Financial Workflow Engine — deterministic aggregate stats over the full
 * execution history. Mirrors lib/feed/statistics.ts and
 * lib/policy/statistics.ts's approach: plain reduction over persisted
 * records, no LLM, no estimation.
 */
export function computeWorkflowStatistics(): WorkflowStatistics {
  const workflows = getAllWorkflows();
  const runs = getAllRuns();

  const totalWorkflows = workflows.length;
  const activeWorkflows = workflows.filter((w) => w.status === "enabled").length;

  const durations = runs.map((r) => r.durationMs).filter((d): d is number => d !== null);
  const averageRuntimeMs = Math.round(average(durations));

  const completedRuns = runs.filter((r) => r.status === "completed").length;
  const successRate = runs.length === 0 ? 0 : Math.round((completedRuns / runs.length) * 100) / 100;

  const triggerCounts = new Map<string, number>();
  const durationsByWorkflow = new Map<string, number[]>();
  for (const run of runs) {
    triggerCounts.set(run.workflowName, (triggerCounts.get(run.workflowName) ?? 0) + 1);
    if (run.durationMs !== null) {
      const list = durationsByWorkflow.get(run.workflowName) ?? [];
      list.push(run.durationMs);
      durationsByWorkflow.set(run.workflowName, list);
    }
  }

  let mostTriggeredWorkflow: string | null = null;
  let mostTriggeredCount = 0;
  for (const [name, count] of triggerCounts) {
    if (count > mostTriggeredCount) {
      mostTriggeredWorkflow = name;
      mostTriggeredCount = count;
    }
  }

  let mostExpensiveWorkflow: string | null = null;
  let mostExpensiveAverage = 0;
  for (const [name, list] of durationsByWorkflow) {
    const avg = average(list);
    if (avg > mostExpensiveAverage) {
      mostExpensiveWorkflow = name;
      mostExpensiveAverage = avg;
    }
  }

  const failedRuns = runs.filter((r) => r.status === "failed").length;
  const retries = runs.reduce((sum, r) => sum + r.retryCount, 0);

  return {
    totalWorkflows,
    activeWorkflows,
    averageRuntimeMs,
    successRate,
    mostTriggeredWorkflow,
    mostExpensiveWorkflow,
    failedRuns,
    retries,
  };
}
