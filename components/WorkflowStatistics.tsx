import { Card, CardContent } from "@/components/ui/card";
import type { WorkflowStatistics as WorkflowStatisticsData } from "@/types/workflow";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default function WorkflowStatistics({ statistics }: { statistics: WorkflowStatisticsData }) {
  return (
    <Card size="sm">
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Workflows" value={statistics.totalWorkflows} />
        <Stat label="Active" value={statistics.activeWorkflows} />
        <Stat label="Avg Runtime" value={`${statistics.averageRuntimeMs}ms`} />
        <Stat label="Success Rate" value={`${Math.round(statistics.successRate * 100)}%`} />
        <Stat label="Failed Runs" value={statistics.failedRuns} />
        <Stat label="Retries" value={statistics.retries} />
        <Stat label="Most Triggered" value={statistics.mostTriggeredWorkflow ?? "—"} />
        <Stat label="Most Expensive" value={statistics.mostExpensiveWorkflow ?? "—"} />
      </CardContent>
    </Card>
  );
}
