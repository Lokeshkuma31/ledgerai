import { isIncomeTransaction } from "@/lib/forecast/calculator";
import type { Transaction } from "@/types/transaction";

export interface MonthlyCashFlow {
  /** "YYYY-MM" */
  month: string;
  /** Short display label, e.g. "Mar". */
  label: string;
  income: number;
  expense: number;
}

/**
 * Trailing month-by-month income/expense totals across a transaction's
 * full history — the aggregation the Dashboard's Cash Flow chart reads.
 * Pure arithmetic over already-stored transactions (the same
 * isIncomeTransaction heuristic the Forecast Engine uses), not a new
 * estimate or projection.
 */
export function generateMonthlyCashFlow(
  transactions: Transaction[],
  monthsBack: number,
  now: Date = new Date(),
): MonthlyCashFlow[] {
  const months: MonthlyCashFlow[] = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short" });
    months.push({ month, label, income: 0, expense: 0 });
  }

  const byMonth = new Map(months.map((m) => [m.month, m]));
  for (const t of transactions) {
    const month = t.date.slice(0, 7);
    const bucket = byMonth.get(month);
    if (!bucket) continue;
    if (isIncomeTransaction(t)) {
      bucket.income += t.amount;
    } else {
      bucket.expense += t.amount;
    }
  }

  return months;
}
