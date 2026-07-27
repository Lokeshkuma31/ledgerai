import type { DetectedQuery, ExecutionPlan, QueryIntent } from "@/types/query";

/** Purely descriptive — which engines a given intent conceptually draws
 * from. Not used for dispatch (router.ts owns that); this exists so the
 * plan is transparent/debuggable, matching the spec's own worked example
 * ("Merchant Engine + Timeline Engine + Insights Engine"). */
const REQUIRED_ENGINES: Record<QueryIntent, string[]> = {
  "transaction-search": ["Timeline Engine", "Insights Engine"],
  "category-spending": ["Insights Engine", "Timeline Engine"],
  "merchant-spending": ["Merchant Engine", "Timeline Engine", "Insights Engine"],
  "budget-status": ["Budget Engine"],
  "cash-flow-forecast": ["Cash Flow Forecast Engine"],
  "recurring-payments": ["Recurring Transaction Engine"],
  "financial-events": ["Financial Events Engine"],
  recommendations: ["Financial Decision Engine"],
  "general-summary": ["Insights Engine", "Budget Engine", "Cash Flow Forecast Engine", "Recurring Transaction Engine"],
  "workflow-status": ["Financial Workflow Engine"],
  unknown: [],
};

/**
 * Converts a detected intent + entities into a concrete execution plan.
 * Deterministic — a thin, table-driven step with no branching logic of
 * its own beyond the lookup above.
 */
export function buildExecutionPlan(detected: DetectedQuery): ExecutionPlan {
  return {
    ...detected,
    requiredEngines: REQUIRED_ENGINES[detected.intent],
  };
}
