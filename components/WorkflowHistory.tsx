"use client";

import { Card, CardContent } from "@/components/ui/card";
import RunStatusBadge from "@/components/RunStatusBadge";
import type { WorkflowRun } from "@/types/workflow";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Flat, clickable list of past runs — pair with WorkflowExecution to show
 * the selected run's full per-step detail. */
export default function WorkflowHistory({
  runs,
  selectedRunId,
  onSelect,
}: {
  runs: WorkflowRun[];
  selectedRunId?: string;
  onSelect?: (run: WorkflowRun) => void;
}) {
  if (runs.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">No workflow runs recorded yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {runs.map((run) => (
        <button
          key={run.runId}
          type="button"
          onClick={() => onSelect?.(run)}
          className={`rounded-lg border px-3 py-2 text-left transition-colors ${
            selectedRunId === run.runId ? "border-ring bg-muted/50" : "border-border hover:bg-muted/30"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{run.workflowName}</span>
            <RunStatusBadge status={run.status} />
          </div>
          <span className="text-muted-foreground text-xs">
            {run.trigger} · {formatTimestamp(run.startedAt)} · {run.durationMs ?? 0}ms ·{" "}
            {run.successfulSteps}/{run.steps.length} steps
            {run.retryCount > 0 ? ` · ${run.retryCount} retries` : ""}
          </span>
        </button>
      ))}
    </div>
  );
}
