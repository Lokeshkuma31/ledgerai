export const RECURRING_FREQUENCIES = [
  "Daily",
  "Weekly",
  "Biweekly",
  "Monthly",
  "Quarterly",
  "Yearly",
  "Unknown",
] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const RECURRING_STATUSES = [
  "Active",
  "Upcoming",
  "Missed",
  "Paused",
  "Stopped",
] as const;
export type RecurringStatus = (typeof RECURRING_STATUSES)[number];

export interface RecurringTransaction {
  id: string;
  merchantId?: string;
  merchantName?: string;
  /** Display name — merchantName when a merchant was identified, otherwise
   * a cleaned-up version of the shared note (e.g. "Rent", "Electricity"). */
  title: string;
  category: string;
  frequency: RecurringFrequency;
  averageAmount: number;
  minimumAmount: number;
  maximumAmount: number;
  lastAmount: number;
  lastOccurrence: string; // "YYYY-MM-DD"
  /** null when frequency is "Unknown" — timing is too irregular to predict. */
  nextExpectedOccurrence: string | null;
  daysRemaining: number | null;
  confidence: number; // 0-1
  transactionCount: number;
  isSubscription: boolean;
  isIncome: boolean;
  isExpense: boolean;
  status: RecurringStatus;
  relatedTransactionIds: string[];
  createdAt: string; // ISO 8601 — when first detected
  updatedAt: string; // ISO 8601 — when last reconciled
}

export interface RecurringStatistics {
  totalActiveSubscriptions: number;
  monthlySubscriptionCost: number;
  yearlySubscriptionCost: number;
  upcomingPaymentsCount: number;
  upcomingPaymentsTotal: number;
  upcomingIncomeCount: number;
  upcomingIncomeTotal: number;
  /** Recurring expense total / total expense total, 0-1. */
  recurringExpenseRatio: number;
  /** Recurring income total / total income total, 0-1. */
  recurringIncomeRatio: number;
}

/** What the AI Financial Coach receives — a structured summary, never the
 * detection logic itself. The engine owns recurrence detection; the Coach
 * only explains it. */
export interface RecurringCoachSummary {
  title: string;
  frequency: RecurringFrequency;
  averageAmount: number;
  nextExpectedOccurrence: string | null;
  status: RecurringStatus;
  isSubscription: boolean;
  isIncome: boolean;
}
