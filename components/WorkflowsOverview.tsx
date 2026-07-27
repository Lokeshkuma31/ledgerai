"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import WorkflowExecution from "@/components/WorkflowExecution";
import WorkflowHistory from "@/components/WorkflowHistory";
import WorkflowList from "@/components/WorkflowList";
import WorkflowStatistics from "@/components/WorkflowStatistics";
import { calculateBudgetStatus } from "@/lib/budget/engine";
import { getBudgets } from "@/lib/budget/storage";
import { generateRecommendations } from "@/lib/decision/engine";
import { applyPersistedStatus } from "@/lib/decision/storage";
import { detectFinancialEvents } from "@/lib/events/engine";
import { generateFeed, type GenerateFeedInput } from "@/lib/feed/engine";
import { generateForecast } from "@/lib/forecast/engine";
import { computeForecastStatistics } from "@/lib/forecast/statistics";
import { generateInsights } from "@/lib/insights/engine";
import { getAllMerchantProfiles } from "@/lib/merchant/knowledge";
import { getPreferences } from "@/lib/policy/preferences";
import { detectRecurringTransactions } from "@/lib/recurring/engine";
import { getTransactions } from "@/lib/storage";
import { generateTimeline } from "@/lib/timeline/engine";
import {
  cloneWorkflow,
  computeWorkflowStatistics,
  deleteWorkflow,
  disableWorkflow,
  enableWorkflow,
  getAllRuns,
  getAllWorkflows,
  isWorkflowRunning,
  runWorkflowById,
} from "@/lib/workflows/engine";
import type { StepContext } from "@/lib/workflows/step";
import type {
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStatistics as WorkflowStatisticsData,
} from "@/types/workflow";

/**
 * Independently recomputes everything a workflow's steps might need — the
 * same pure engines the Dashboard's Orchestrator calls — so "Run Now" can
 * exercise a workflow from this page without a full FinancialState build.
 * Mirrors the pattern SearchOverview.tsx / RecurringOverview.tsx already
 * use for their own client-side recomputes.
 */
function buildWorkflowContext(): StepContext {
  const now = new Date();
  const transactions = getTransactions();
  const merchantProfiles = getAllMerchantProfiles();
  const rawBudgets = getBudgets();
  const budgetStatuses = calculateBudgetStatus(rawBudgets, transactions, now);
  const insights = generateInsights(transactions);
  const timeline = generateTimeline(transactions, now);
  const recurringReconciliation = detectRecurringTransactions(transactions, merchantProfiles, now);
  const recurring = recurringReconciliation.items;
  const forecast = generateForecast(transactions, recurring, budgetStatuses, insights, timeline, now);
  const forecastStatistics = computeForecastStatistics(forecast, transactions, now);
  const events = detectFinancialEvents(transactions, {
    budgetStatuses,
    recurring: recurringReconciliation,
    forecast: { forecast, statistics: forecastStatistics },
    now,
  });
  const recommendations = applyPersistedStatus(
    generateRecommendations({ transactions, budgets: rawBudgets, events, insights, timeline, now }),
  );
  const feedInput: GenerateFeedInput = {
    transactions,
    budgetStatuses,
    events,
    recommendations,
    recurring,
    newlyDetectedRecurring: recurringReconciliation.newlyDetected,
    forecast,
    forecastStatistics,
    merchantProfiles,
    insights,
    timeline,
    now,
  };
  const feed = generateFeed(feedInput);
  const explanationContext = {
    transactions,
    budgets: budgetStatuses,
    events,
    recommendations,
    recurring,
    merchantProfiles,
    forecast,
    insights,
    timeline,
    now,
  };

  return {
    transactions,
    budgets: rawBudgets,
    budgetStatuses,
    events,
    recommendations,
    recurring,
    recurringReconciliation,
    forecast,
    forecastStatistics,
    merchantProfiles,
    insights,
    timeline,
    feed,
    feedInput,
    explanationContext,
    preferences: getPreferences(),
    now,
  };
}

export default function WorkflowsOverview() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [statistics, setStatistics] = useState<WorkflowStatisticsData | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());

  function refresh() {
    setWorkflows(getAllWorkflows());
    setRuns(getAllRuns());
    setStatistics(computeWorkflowStatistics());
  }

  useEffect(() => {
    refresh();
  }, []);

  const lastRunDetailsByWorkflowId = useMemo(() => {
    const map = new Map<string, WorkflowRun>();
    for (const workflow of workflows) {
      if (!workflow.lastRun) continue;
      const run = runs.find((r) => r.runId === workflow.lastRun!.runId);
      if (run) map.set(workflow.id, run);
    }
    return map;
  }, [workflows, runs]);

  const selectedRun = runs.find((r) => r.runId === selectedRunId);
  const selectedDefinition = selectedRun
    ? workflows.find((w) => w.id === selectedRun.workflowId)
    : undefined;

  function handleToggleEnabled(workflow: WorkflowDefinition) {
    if (workflow.status === "enabled") disableWorkflow(workflow.id);
    else enableWorkflow(workflow.id);
    refresh();
  }

  function handleClone(workflow: WorkflowDefinition) {
    cloneWorkflow(workflow.id);
    refresh();
  }

  function handleDelete(workflow: WorkflowDefinition) {
    deleteWorkflow(workflow.id);
    refresh();
  }

  async function handleRunNow(workflow: WorkflowDefinition) {
    if (isWorkflowRunning(workflow.id)) return;
    setRunningIds((prev) => new Set(prev).add(workflow.id));
    try {
      const context = buildWorkflowContext();
      const run = await runWorkflowById(workflow.id, context);
      if (run) setSelectedRunId(run.runId);
    } finally {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(workflow.id);
        return next;
      });
      refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {statistics && <WorkflowStatistics statistics={statistics} />}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Registered Workflows</h2>
        <WorkflowList
          workflows={workflows}
          lastRunDetailsByWorkflowId={lastRunDetailsByWorkflowId}
          runningWorkflowIds={runningIds}
          onToggleEnabled={handleToggleEnabled}
          onClone={handleClone}
          onDelete={handleDelete}
          onRunNow={handleRunNow}
        />
      </div>
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="flex flex-1 flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Execution History</h2>
          <WorkflowHistory
            runs={runs}
            selectedRunId={selectedRunId}
            onSelect={(run) => setSelectedRunId(run.runId)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Run Detail</h2>
          {selectedRun ? (
            <WorkflowExecution run={selectedRun} definition={selectedDefinition} />
          ) : (
            <Card>
              <CardContent>
                <p className="text-muted-foreground">
                  Select a run to see its full step-by-step detail.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
