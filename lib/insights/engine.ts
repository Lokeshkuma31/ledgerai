import type { PaymentMethod, Transaction } from "@/types/transaction";

export interface CategoryBreakdownEntry {
  category: string;
  total: number;
  percentage: number; // raw, unrounded — round only at display time
}

export interface Insights {
  totalSpent: number;
  totalTransactions: number;
  averageExpense: number;
  largestExpense: number;
  smallestExpense: number;
  /**
   * Category appearing in the most transactions (occurrence count), NOT the
   * category with the highest total amount — those can legitimately differ.
   * See categoryBreakdown for the amount-based ranking.
   */
  topCategory: string | null;
  /** Payment method used in the most transactions (occurrence count). */
  topPaymentMethod: PaymentMethod | null;
  /** Sorted descending by total amount. */
  categoryBreakdown: CategoryBreakdownEntry[];
}

function effectiveCategory(transaction: Transaction): string {
  return transaction.userCategory ?? transaction.aiCategory ?? "Other";
}

/**
 * Returns the most frequently occurring item. Ties resolve in favor of
 * whichever item first appears in the input array (Map iteration order
 * follows insertion order) — since transactions are normally newest-first,
 * a tie favors the more recently seen item.
 */
function computeMostFrequent<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  const counts = new Map<T, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  let top: T | null = null;
  let topCount = 0;
  for (const [item, count] of counts) {
    if (count > topCount) {
      top = item;
      topCount = count;
    }
  }
  return top;
}

function emptyInsights(): Insights {
  return {
    totalSpent: 0,
    totalTransactions: 0,
    averageExpense: 0,
    largestExpense: 0,
    smallestExpense: 0,
    topCategory: null,
    topPaymentMethod: null,
    categoryBreakdown: [],
  };
}

export function generateInsights(transactions: Transaction[]): Insights {
  if (transactions.length === 0) return emptyInsights();

  const amounts = transactions.map((t) => t.amount);
  const totalSpent = amounts.reduce((sum, a) => sum + a, 0);
  const totalTransactions = transactions.length;
  const averageExpense = totalSpent / totalTransactions;
  const largestExpense = Math.max(...amounts);
  const smallestExpense = Math.min(...amounts);

  const topCategory = computeMostFrequent(transactions.map(effectiveCategory));
  const topPaymentMethod = computeMostFrequent(
    transactions.map((t) => t.paymentMethod),
  );

  const categoryTotals = new Map<string, number>();
  for (const t of transactions) {
    const category = effectiveCategory(t);
    categoryTotals.set(
      category,
      (categoryTotals.get(category) ?? 0) + t.amount,
    );
  }

  const categoryBreakdown: CategoryBreakdownEntry[] = Array.from(
    categoryTotals.entries(),
  )
    .map(([category, total]) => ({
      category,
      total,
      percentage: (total / totalSpent) * 100,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    totalSpent,
    totalTransactions,
    averageExpense,
    largestExpense,
    smallestExpense,
    topCategory,
    topPaymentMethod,
    categoryBreakdown,
  };
}
