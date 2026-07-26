export type FinancialEventType =
  | "large-expense"
  | "recurring-expense"
  | "salary-received"
  | "multiple-expenses-same-day"
  | "budget-exceeded"
  | "budget-warning"
  | "new-merchant"
  | "high-spending-day"
  | "weekend-spending"
  | "no-spending-day"
  | "subscription-renewing"
  | "salary-expected"
  | "recurring-payment-missed"
  | "new-subscription-detected"
  | "recurring-amount-changed"
  | "forecast-risk-increased"
  | "budget-likely-exceeded"
  | "positive-cash-flow"
  | "negative-cash-flow"
  | "income-shortfall"
  | "unexpected-spending-trend";

export type FinancialEventSeverity =
  | "info"
  | "warning"
  | "important"
  | "critical";

export interface FinancialEvent {
  id: string;
  type: FinancialEventType;
  title: string;
  description: string;
  /** "YYYY-MM-DD", local calendar date the event pertains to. */
  date: string;
  severity: FinancialEventSeverity;
  relatedTransactionIds: string[];
  metadata: Record<string, unknown>;
  /** ISO 8601 timestamp — when this engine run detected the event. */
  createdAt: string;
}
