// Shared TypeScript types will live here as the app grows.

/** Every kind of object the Financial Semantic Index can hold. Deliberately
 * flat — no embeddings, no vectors, just typed, keyword-searchable records. */
export const INDEX_OBJECT_TYPES = [
  "transaction",
  "merchant",
  "merchant-profile",
  "category",
  "timeline-entry",
  "budget",
  "financial-event",
  "recommendation",
  "recurring-transaction",
  "forecast-summary",
  "conversation",
  "explanation",
  "workflow",
  "bank-account",
  "bank-institution",
  "bank-sync-run",
  "consent",
  "document",
  "email",
  "connection",
  "sync-job",
] as const;
export type IndexObjectType = (typeof INDEX_OBJECT_TYPES)[number];

/** A single indexed record. `searchableText` is the lowercased, pre-joined
 * blob search.ts matches keywords against — built once at index time so
 * search itself never re-derives it per query. */
export interface IndexedObject {
  id: string;
  type: IndexObjectType;
  title: string;
  description: string;
  keywords: string[];
  category?: string;
  merchant?: string;
  date?: string; // "YYYY-MM-DD"
  amount?: number;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  searchableText: string;
}

export interface FinancialIndex {
  objects: IndexedObject[];
  generatedAt: string; // ISO 8601
  counts: Record<IndexObjectType, number>;
}

/** Every raw source the Index Builder draws from — the same shape of data
 * the Financial Query Engine already receives via QueryDataSources, so no
 * new data-fetching is needed to build the index. */
export interface FinancialIndexSources {
  transactions: import("@/types/transaction").Transaction[];
  merchants: import("@/types/merchant").Merchant[];
  merchantProfiles: import("@/types/merchant-profile").MerchantProfile[];
  insights: import("@/lib/insights/engine").Insights;
  timeline: import("@/lib/timeline/engine").TimelineGroup[];
  budgets: import("@/types/budget").BudgetStatus[];
  events: import("@/types/event").FinancialEvent[];
  recommendations: import("@/types/recommendation").Recommendation[];
  recurring: import("@/types/recurring").RecurringTransaction[];
  forecast: import("@/types/forecast").CashFlowForecast;
  conversationHistory: import("@/types/query").QueryResult[];
  explanations: import("@/types/explanation").Explanation[];
  /** Optional — most callers (the Query Engine, the Search page) don't
   * have workflow data on hand and don't need to; the Financial
   * Intelligence Orchestrator is the one caller that passes it. */
  workflowRuns?: import("@/types/workflow").WorkflowRun[];
  now: Date;
}

export type SearchSortMode = "relevance" | "date" | "amount";

export interface SearchFilters {
  types?: IndexObjectType[];
  category?: string;
  merchant?: string;
  dateRange?: { start: string; end: string };
  amountRange?: { min?: number; max?: number };
  /** Require an exact (case-insensitive, full-field) match instead of a
   * keyword/partial one. */
  exact?: boolean;
}

export interface SearchOptions {
  query: string;
  filters?: SearchFilters;
  sortBy?: SearchSortMode;
  limit?: number;
}

export type SearchMatchType = "exact" | "partial" | "filter-only";

export interface SearchResultItem {
  object: IndexedObject;
  score: number;
  matchType: SearchMatchType;
}

export interface SearchResult {
  query: string;
  items: SearchResultItem[];
  totalMatches: number;
  generatedAt: string; // ISO 8601
}

export interface RecentSearch {
  id: string;
  query: string;
  filters?: SearchFilters;
  resultCount: number;
  pinned: boolean;
  createdAt: string; // ISO 8601
}

export interface SearchStatistics {
  totalIndexedObjects: number;
  countsByType: Record<IndexObjectType, number>;
  totalSearches: number;
  mostSearchedTerms: { term: string; count: number }[];
}
