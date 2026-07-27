import { Card, CardContent } from "@/components/ui/card";
import WorkflowTimeline from "@/components/WorkflowTimeline";
import type { WorkflowDefinition, WorkflowRun, WorkflowRunStatus } from "@/types/workflow";

const STATUS_STYLES: Record<WorkflowRunStatus, string> = {
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed: "bg-destructive/10 text-destructive",
  partial: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  running: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Full detail for a single workflow run — Workflow, Trigger, Duration,
 * Successful/Failed Steps, Retry Count, Timestamp, plus the step-by-step
 * timeline, matching lib/workflows/history.ts's WorkflowRun record. */
export default function WorkflowExecution({
  run,
  definition,
}: {
  run: WorkflowRun;
  /** The workflow's current definition, if still registered — used only
   * to resolve friendly step labels; the run itself is self-contained. */
  definition?: WorkflowDefinition;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium">{run.workflowName}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${STATUS_STYLES[run.status]}`}
          >
            {run.status}
          </span>
        </div>
        <span className="text-muted-foreground text-xs">
          Trigger: {run.trigger} · Started {formatTimestamp(run.startedAt)}
          {run.completedAt ? ` · Completed ${formatTimestamp(run.completedAt)}` : ""}
        </span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">Duration</span>
            <span className="text-sm font-medium">{run.durationMs ?? 0}ms</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">Successful Steps</span>
            <span className="text-sm font-medium">{run.successfulSteps}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">Failed Steps</span>
            <span className="text-sm font-medium">{run.failedSteps}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">Retries</span>
            <span className="text-sm font-medium">{run.retryCount}</span>
          </div>
        </div>
        <WorkflowTimeline results={run.steps} definitions={definition?.steps} />
      </CardContent>
    </Card>
  );
}
