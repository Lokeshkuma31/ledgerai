import { Badge } from "@/components/ui/badge";
import type { WorkflowStepDefinition, WorkflowStepResult, WorkflowStepStatus } from "@/types/workflow";

const STATUS_VARIANT: Record<WorkflowStepStatus, "secondary" | "info" | "success" | "destructive" | "warning"> = {
  pending: "secondary",
  running: "info",
  completed: "success",
  failed: "destructive",
  skipped: "secondary",
  retrying: "warning",
};

const STATUS_LABELS: Record<WorkflowStepStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
  retrying: "Retrying",
};

function humanizeAction(action: string): string {
  const spaced = action.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Synthesizes "not run yet" placeholders from a workflow's static step
 * definitions — used when a workflow has no lastRun to show a real
 * WorkflowStepResult[] for, so the timeline still previews its sequence. */
export function pendingSteps(definitions: WorkflowStepDefinition[]): WorkflowStepResult[] {
  return definitions.map((def) => ({
    id: def.id,
    engine: def.engine,
    action: def.action,
    input: {},
    output: null,
    status: "pending",
    startedAt: null,
    completedAt: null,
    duration: null,
    error: null,
    retryCount: 0,
  }));
}

/**
 * Renders a workflow run's steps as a vertical timeline — the spec's own
 * example ("Transaction Imported ↓ Merchant Intelligence ↓ ..."). Purely
 * presentational: every field it shows was already computed by
 * lib/workflows/executor.ts.
 */
export default function WorkflowTimeline({
  results,
  definitions,
}: {
  results: WorkflowStepResult[];
  /** The workflow's own step definitions, used only to resolve each
   * step's human-readable label; falls back to humanizing the action
   * string when omitted or when a step's definition can't be found. */
  definitions?: WorkflowStepDefinition[];
}) {
  const labelById = new Map((definitions ?? []).map((d) => [d.id, d.label]));

  return (
    <div className="flex flex-col">
      {results.map((step, index) => (
        <div key={step.id} className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[step.status]}>{STATUS_LABELS[step.status]}</Badge>
            <span className="text-sm font-medium">
              {labelById.get(step.id) ?? humanizeAction(step.action)}
            </span>
            <span className="text-muted-foreground text-xs">{step.engine}</span>
            {step.duration !== null && (
              <span className="text-muted-foreground text-xs">{step.duration}ms</span>
            )}
            {step.retryCount > 0 && (
              <span className="text-muted-foreground text-xs">
                {step.retryCount} retr{step.retryCount === 1 ? "y" : "ies"}
              </span>
            )}
          </div>
          {step.error && <p className="text-destructive pl-1 text-xs">{step.error}</p>}
          {index < results.length - 1 && (
            <span className="text-muted-foreground py-0.5 pl-2 text-xs" aria-hidden="true">
              ↓
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
