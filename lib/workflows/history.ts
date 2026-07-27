import type { WorkflowRun, WorkflowTrigger } from "@/types/workflow";

const HISTORY_KEY = "ledgerai:workflows:history";
const MAX_ENTRIES = 200;

function readHistory(): WorkflowRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WorkflowRun[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(runs: WorkflowRun[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(runs));
}

/** Newest first. */
export function getAllRuns(): WorkflowRun[] {
  return readHistory();
}

export function getRunById(runId: string): WorkflowRun | undefined {
  return readHistory().find((r) => r.runId === runId);
}

export function getRunsByWorkflow(workflowId: string): WorkflowRun[] {
  return readHistory().filter((r) => r.workflowId === workflowId);
}

export function getRunsByTrigger(trigger: WorkflowTrigger): WorkflowRun[] {
  return readHistory().filter((r) => r.trigger === trigger);
}

/** Appends one run, newest first, capped to MAX_ENTRIES so the log can't
 * grow unbounded across a long-lived session. */
export function recordRun(run: WorkflowRun): WorkflowRun[] {
  const updated = [run, ...readHistory()].slice(0, MAX_ENTRIES);
  writeHistory(updated);
  return updated;
}

export function clearHistory(): WorkflowRun[] {
  writeHistory([]);
  return [];
}
