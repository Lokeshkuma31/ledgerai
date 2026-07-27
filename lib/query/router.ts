import {
  executeBudgetStatus,
  executeCashFlowForecast,
  executeCategorySpending,
  executeFinancialEvents,
  executeGeneralSummary,
  executeMerchantSpending,
  executeRecommendations,
  executeRecurringPayments,
  executeTransactionSearch,
  executeUnknown,
  executeWorkflowStatus,
} from "@/lib/query/executor";
import type { FinancialIndex } from "@/types/index";
import type { ExecutionPlan, QueryDataSources, QueryIntent } from "@/types/query";

type Executor = (
  plan: ExecutionPlan,
  data: QueryDataSources,
  index: FinancialIndex,
) => Record<string, unknown>;

const EXECUTORS: Record<QueryIntent, Executor> = {
  "transaction-search": executeTransactionSearch,
  "category-spending": executeCategorySpending,
  "merchant-spending": executeMerchantSpending,
  "budget-status": executeBudgetStatus,
  "cash-flow-forecast": executeCashFlowForecast,
  "recurring-payments": executeRecurringPayments,
  "financial-events": executeFinancialEvents,
  recommendations: executeRecommendations,
  "general-summary": executeGeneralSummary,
  "workflow-status": executeWorkflowStatus,
  unknown: executeUnknown,
};

/**
 * Dispatches a plan to the executor registered for its intent. This is
 * the only place that decides "which executor handles which intent" —
 * planner.ts builds the plan, this routes it, executor.ts does the work.
 */
export function routeExecution(
  plan: ExecutionPlan,
  data: QueryDataSources,
  index: FinancialIndex,
): Record<string, unknown> {
  const executor = EXECUTORS[plan.intent];
  return executor(plan, data, index);
}
