export type RecommendationCategory =
  | "Budget"
  | "Savings"
  | "Subscriptions"
  | "Spending"
  | "Income"
  | "Habits"
  | "Forecast"
  | "General";

export type RecommendationPriority = "low" | "medium" | "high" | "critical";

export type RecommendationStatus = "new" | "dismissed" | "completed";

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: RecommendationPriority;
  category: RecommendationCategory;
  reason: string;
  action: string;
  /** ISO 8601 timestamp — preserved across regenerations once a status is persisted. */
  createdAt: string;
  status: RecommendationStatus;
}
