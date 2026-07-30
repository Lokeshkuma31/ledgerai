import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import RunStatusBadge from "@/components/RunStatusBadge";
import WorkflowTimeline, { pendingSteps } from "@/components/WorkflowTimeline";
import type { WorkflowDefinition, WorkflowRun, WorkflowTrigger } from "@/types/workflow";

const TRIGGER_LABELS: Record<WorkflowTrigger, string> = {
  "transaction-imported": "Transaction Imported",
  "transaction-created": "Transaction Created",
  "transaction-reviewed": "Transaction Reviewed",
  "budget-updated": "Budget Updated",
  "budget-exceeded": "Budget Exceeded",
  "forecast-updated": "Forecast Updated",
  "recurring-transaction-detected": "Recurring Transaction Detected",
  "merchant-added": "Merchant Added",
  "recommendation-generated": "Recommendation Generated",
  "financial-event-created": "Financial Event Created",
  "feed-updated": "Feed Updated",
  "daily-refresh": "Daily Refresh",
  "manual-run": "Manual Run",
  "consent-granted": "Consent Granted",
  "account-connected": "Account Connected",
  "sync-completed": "Sync Completed",
  "sync-failed": "Sync Failed",
  "sync-large-import": "Large Import Completed",
  "sync-duplicate-detected": "Duplicate Detected",
  "sync-provider-reconnected": "Provider Reconnected",
  disconnect: "Disconnect",
  "connection-token-refreshed": "Connection Token Refreshed",
  "connection-failed": "Connection Failed",
  "connection-permission-revoked": "Connection Permission Revoked",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function WorkflowCard({
  workflow,
  lastRunDetail,
  isRunning,
  onToggleEnabled,
  onClone,
  onDelete,
  onRunNow,
}: {
  workflow: WorkflowDefinition;
  /** The full per-step run detail for workflow.lastRun, if the caller
   * looked it up from lib/workflows/history.ts — falls back to a
   * "not run yet" preview of the definition's own steps. */
  lastRunDetail?: WorkflowRun;
  isRunning?: boolean;
  onToggleEnabled?: (workflow: WorkflowDefinition) => void;
  onClone?: (workflow: WorkflowDefinition) => void;
  onDelete?: (workflow: WorkflowDefinition) => void;
  onRunNow?: (workflow: WorkflowDefinition) => void;
}) {
  return (
    <Card size="sm" className="hover:ring-primary/30 transition-shadow hover:shadow-md">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{workflow.name}</span>
            <span className="text-muted-foreground text-xs">
              v{workflow.version} · Priority {workflow.priority}
            </span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <Badge variant="secondary">{TRIGGER_LABELS[workflow.trigger]}</Badge>
            <Badge variant={workflow.status === "enabled" ? "success" : "secondary"}>
              {workflow.status === "enabled" ? "Enabled" : "Disabled"}
            </Badge>
          </div>
        </div>
        <p className="text-sm">{workflow.description}</p>
        {workflow.lastRun && (
          <span className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
            Last run:
            <RunStatusBadge status={workflow.lastRun.status} />
            {formatTimestamp(workflow.lastRun.startedAt)} · {workflow.lastRun.durationMs ?? 0}ms ·{" "}
            {workflow.lastRun.successfulSteps}/{workflow.steps.length} steps
          </span>
        )}
        <WorkflowTimeline
          definitions={workflow.steps}
          results={lastRunDetail?.steps ?? pendingSteps(workflow.steps)}
        />
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {onRunNow && (
            <Button variant="outline" size="xs" onClick={() => onRunNow(workflow)} disabled={isRunning}>
              {isRunning ? "Running…" : "Run Now"}
            </Button>
          )}
          {onToggleEnabled && (
            <Button variant="outline" size="xs" onClick={() => onToggleEnabled(workflow)}>
              {workflow.status === "enabled" ? "Disable" : "Enable"}
            </Button>
          )}
          {onClone && (
            <Button variant="outline" size="xs" onClick={() => onClone(workflow)}>
              Clone
            </Button>
          )}
          {onDelete && (
            <Button variant="destructive" size="xs" onClick={() => onDelete(workflow)}>
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
