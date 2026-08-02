export const QUERY_INTENTS = [
  "transaction-search",
  "category-spending",
  "merchant-spending",
  "budget-status",
  "cash-flow-forecast",
  "recurring-payments",
  "financial-events",
  "recommendations",
  "general-summary",
  "workflow-status",
  "unknown",
] as const;
export type QueryIntent = (typeof QUERY_INTENTS)[number];

export type AmountComparison = "more-than" | "less-than" | "at-least" | "at-most" | "exactly";

export interface DateRangeEntity {
  /** Human label as it appeared in / was inferred from the question, e.g. "Last Month". */
  label: string;
  start: string; // "YYYY-MM-DD", inclusive
  end: string; // "YYYY-MM-DD", inclusive
}

export interface AmountEntity {
  comparison: AmountComparison;
  amount: number;
}

/** Everything Entity Extraction can pull from a question — every field is
 * optional since most questions only mention a subset. */
export interface QueryEntities {
  merchant?: string;
  category?: string;
  dateRange?: DateRangeEntity;
  amount?: AmountEntity;
  frequency?: string;
}

export interface DetectedQuery {
  question: string;
  intent: QueryIntent;
  entities: QueryEntities;
}

export interface ExecutionPlan extends DetectedQuery {
  /** Display/debug list of which engines this plan draws from — not used
   * for dispatch (router.ts owns that), just for transparency. */
  requiredEngines: string[];
}

/** Loosely-typed structured JSON handed to the AI Coach — shape varies by
 * intent, matching the spec's own example. Never contains raw transactions
 * unless the intent is literally "transaction-search". */
export type QueryContext = Record<string, unknown>;

/** Everything the executor draws from — all of it already computed by
 * the Financial Intelligence Orchestrator (or the Merchant Knowledge
 * Graph) before the query engine ever runs. The executor only filters and
 * aggregates this; it never re-runs an engine or touches storage itself. */
export interface QueryDataSources {
  transactions: import("@/types/transaction").Transaction[];
  merchants: import("@/types/merchant").Merchant[];
  merchantProfiles: import("@/types/merchant-profile").MerchantProfile[];
  insights: import("@/lib/insights/engine").Insights;
  timeline: import("@/lib/timeline/engine").TimelineGroup[];
  budgets: import("@/types/budget").BudgetStatus[];
  recurring: import("@/types/recurring").RecurringTransaction[];
  events: import("@/types/event").FinancialEvent[];
  recommendations: import("@/types/recommendation").Recommendation[];
  forecast: import("@/types/forecast").CashFlowForecast;
  /** Past questions/answers — also fed into the Semantic Index as
   * "conversation" objects so a follow-up question can surface earlier
   * ones. */
  conversationHistory: QueryResult[];
  now: Date;
}

export interface QueryResult {
  id: string;
  question: string;
  intent: QueryIntent;
  answer: string;
  context: QueryContext;
  createdAt: string; // ISO 8601
  /** Attached by the Explanation Engine — why the engine answered this way,
   * with its own supporting evidence and confidence. Optional only because
   * older persisted history entries (pre-dating this field) won't have one. */
  explanation?: import("@/types/explanation").Explanation;
  /** Copied from ExecutionPlan.requiredEngines — which engines fed this
   * specific answer, surfaced in the AI Coach workspace's "Context Sources"
   * disclosure. Optional because older persisted history entries won't
   * have one. */
  requiredEngines?: string[];
}
