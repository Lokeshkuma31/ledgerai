export const EXPLAINABLE_OBJECT_TYPES = [
  "budget",
  "forecast",
  "recommendation",
  "recurring-transaction",
  "financial-event",
  "merchant-profile",
  "insight",
  "timeline-summary",
  "search-result",
  "query-response",
] as const;
export type ExplainableObjectType = (typeof EXPLAINABLE_OBJECT_TYPES)[number];

export interface EvidenceItem {
  label: string;
  value: string;
}

/** A lightweight pointer to another object an explanation draws on —
 * enough for the Registry to answer "explanations related to Amazon" or
 * "...related to Food" without embedding the full object. */
export interface RelatedObjectRef {
  type: string;
  id: string;
  label: string;
}

export interface Explanation {
  id: string;
  objectType: ExplainableObjectType;
  objectId: string;
  title: string;
  summary: string;
  reason: string;
  supportingEvidence: EvidenceItem[];
  confidence: number; // 0-1
  generatedAt: string; // ISO 8601 — set once, preserved across regenerations
  lastUpdated: string; // ISO 8601 — bumped every regeneration
  tags: string[];
  relatedObjects: RelatedObjectRef[];
}

/** Everything the Explanation Engine draws from — the same shape of data
 * the Query Engine and Semantic Index already assemble, so no new
 * data-fetching is needed to explain something. */
export interface ExplanationContext {
  transactions: import("@/types/transaction").Transaction[];
  budgets: import("@/types/budget").BudgetStatus[];
  events: import("@/types/event").FinancialEvent[];
  recommendations: import("@/types/recommendation").Recommendation[];
  recurring: import("@/types/recurring").RecurringTransaction[];
  merchantProfiles: import("@/types/merchant-profile").MerchantProfile[];
  forecast: import("@/types/forecast").CashFlowForecast;
  insights: import("@/lib/insights/engine").Insights;
  timeline: import("@/lib/timeline/engine").TimelineGroup[];
  now: Date;
}

/** What the AI Financial Coach receives — never asked to derive reasoning
 * from raw data itself. */
export interface ExplanationCoachSummary {
  objectType: ExplainableObjectType;
  title: string;
  reason: string;
  supportingEvidence: EvidenceItem[];
  confidence: number;
}
