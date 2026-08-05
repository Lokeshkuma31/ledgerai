/**
 * Workflow execution job — subscribes to ledger/workflow.trigger, the one
 * generic indirection event every domain publishes instead of calling
 * lib/workflows/runner.ts::runWorkflowsForTrigger inline (see
 * docs/job-platform/01-architecture-diagram.md's "Integration Patterns":
 * "The Workflow Engine publishes domain events. The Job Platform
 * subscribes and orchestrates.").
 *
 * Deliberately does NOT call lib/workflows/runner.ts — that module reads/
 * writes lib/workflows/registry.ts + lib/workflows/history.ts, both
 * window-guarded (localStorage), so calling it server-side silently no-ops
 * (getWorkflowsByTrigger returns nothing, recordRun writes nothing). This
 * job instead composes the same two real building blocks
 * lib/workflows/runner.ts itself composes — lib/workflows/executor.ts::
 * executeWorkflow (pure step orchestration, unchanged) and
 * services/workflows/workflow-service.ts (the Postgres-backed successor to
 * registry.ts/history.ts) — so the identical execution logic now actually
 * persists when run from the server.
 */
import { defineJob } from "@/lib/jobs/worker";
import { dispatch } from "@/lib/jobs/dispatcher";
import { buildKey } from "@/lib/jobs/idempotency";
import { orgConcurrency, globalConcurrency } from "@/lib/jobs/queue";
import { executeWorkflow } from "@/lib/workflows/executor";
import * as workflowService from "@/services/workflows/workflow-service";
import { listTransactions } from "@/services/transactions/transaction-service";
import { getBudgetStatuses } from "@/services/budgets/budget-service";
import type { EventPayload } from "@/lib/jobs/events";
import type { WorkflowTrigger } from "@/types/workflow";

export const workflowExecute = defineJob<EventPayload<"ledger/workflow.trigger">>(
  {
    id: "workflow-execute",
    name: "Workflow Execution",
    trigger: { event: "ledger/workflow.trigger" },
    concurrency: [orgConcurrency(3), globalConcurrency(20)],
  },
  async ({ event, organizationId, correlationId, step }) => {
    if (!organizationId) return { skipped: true };
    const trigger = event.data.trigger as WorkflowTrigger;
    const payload = event.data.payload ?? {};

    const definitions = (await step.run("find-workflows", () =>
      workflowService.getWorkflowsByTrigger(organizationId, trigger),
    )) as Awaited<ReturnType<typeof workflowService.getWorkflowsByTrigger>>;
    const enabled = definitions.filter((d) => d.status === "enabled");
    if (enabled.length === 0) return { matched: 0 };

    // Base context every step handler can draw from — see
    // docs/job-platform's worked-example caveat: this doesn't replicate
    // lib/intelligence/orchestrator.ts's full FinancialState assembly
    // (goals/decision/coach data), only the two inputs most steps need
    // (transactions, budgetStatuses), plus the trigger's own event payload
    // merged in for trigger-specific fields (connectionId, transactionId, ...).
    const [transactions, budgetStatuses] = await step.run("load-context", async () => [
      await listTransactions(organizationId),
      await getBudgetStatuses(organizationId),
    ]);

    const results: { workflowId: string; runId: string; status: string }[] = [];
    for (const definition of enabled) {
      const run = await step.run(`run-${definition.id}`, async () => {
        const context = { ...payload, transactions, budgetStatuses };
        const executed = await executeWorkflow(definition, context, trigger, new Date());
        await workflowService.recordRun(
          organizationId,
          definition.id,
          executed,
          buildKey(event.id, definition.id),
        );
        return executed;
      });
      results.push({ workflowId: definition.id, runId: run.runId, status: run.status });
    }

    // One workflow.completed dispatch per run — downstream fan-in
    // (feed-generate, notification-generate) treats each independently.
    for (const result of results) {
      await dispatch(
        "ledger/workflow.completed",
        { organizationId, correlationId, workflowRunId: result.runId, status: result.status },
        { id: buildKey("workflow-completed", result.runId) },
      );
    }

    return { matched: enabled.length, results };
  },
);
