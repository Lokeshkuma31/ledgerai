import type { Category } from "@/types/transaction";

export interface Budget {
  id: string;
  category: Category;
  monthlyLimit: number;
  createdAt: string; // ISO 8601 timestamp
}

export type BudgetStatusLevel = "safe" | "warning" | "exceeded";

export interface BudgetStatus {
  id: string;
  category: Category;
  monthlyLimit: number;
  currentSpend: number;
  remainingAmount: number;
  /** raw, unrounded — round only at display time */
  percentageUsed: number;
  transactionCount: number;
  daysRemainingThisMonth: number;
  status: BudgetStatusLevel;
}
