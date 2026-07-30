import { Card, CardContent } from "@/components/ui/card";
import WorkflowCard from "@/components/WorkflowCard";
import type { WorkflowDefinition, WorkflowRun } from "@/types/workflow";

export default function WorkflowList({
  workflows,
  lastRunDetailsByWorkflowId,
  runningWorkflowIds,
  onToggleEnabled,
  onClone,
  onDelete,
  onRunNow,
}: {
  workflows: WorkflowDefinition[];
  lastRunDetailsByWorkflowId?: Map<string, WorkflowRun>;
  runningWorkflowIds?: Set<string>;
  onToggleEnabled?: (workflow: WorkflowDefinition) => void;
  onClone?: (workflow: WorkflowDefinition) => void;
  onDelete?: (workflow: WorkflowDefinition) => void;
  onRunNow?: (workflow: WorkflowDefinition) => void;
}) {
  if (workflows.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">No workflows registered yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {[...workflows]
        .sort((a, b) => b.priority - a.priority)
        .map((workflow) => (
          <WorkflowCard
            key={workflow.id}
            workflow={workflow}
            lastRunDetail={lastRunDetailsByWorkflowId?.get(workflow.id)}
            isRunning={runningWorkflowIds?.has(workflow.id)}
            onToggleEnabled={onToggleEnabled}
            onClone={onClone}
            onDelete={onDelete}
            onRunNow={onRunNow}
          />
        ))}
    </div>
  );
}
