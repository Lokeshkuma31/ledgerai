import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import ChartCard from "./ChartCard";
import { formatCurrencyINR } from "@/lib/visualization/formatter";
import type { BudgetStatus, BudgetStatusLevel } from "@/types/budget";

const STATUS_VARIANT: Record<BudgetStatusLevel, "success" | "warning" | "destructive"> = {
  safe: "success",
  warning: "warning",
  exceeded: "destructive",
};

/**
 * Renders BudgetStatus[] (lib/budget/engine.ts::calculateBudgetStatus)
 * directly — zero new math, just a progress bar per budget. This month
 * only, since BudgetStatus is inherently a current-month snapshot; see
 * BudgetBurnRateChart for the trailing-month trend.
 */
export default function BudgetProgressChart({
  budgets,
  compact = false,
}: {
  budgets: BudgetStatus[];
  compact?: boolean;
}) {
  const rows = compact ? budgets.slice(0, 3) : budgets;

  if (rows.length === 0) {
    const empty = <p className="text-muted-foreground py-8 text-center text-sm">No budgets configured yet.</p>;
    return compact ? empty : <ChartCard title="Budget Progress" description="This month's spend against each configured limit.">{empty}</ChartCard>;
  }

  const body = (
    <div className="flex flex-col gap-4">
      {rows.map((budget) => (
        <div key={budget.id} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span>{budget.category}</span>
            <span className="flex items-center gap-2">
              <span className="font-numeric text-muted-foreground">
                {formatCurrencyINR(budget.currentSpend)} / {formatCurrencyINR(budget.monthlyLimit)}
              </span>
              <Badge variant={STATUS_VARIANT[budget.status]}>{Math.round(budget.percentageUsed)}%</Badge>
            </span>
          </div>
          <Progress value={Math.min(100, budget.percentageUsed)}>
            <div className="sr-only">{budget.category} budget usage</div>
          </Progress>
        </div>
      ))}
    </div>
  );

  if (compact) return body;

  return (
    <ChartCard
      title="Budget Progress"
      description="This month's spend against each configured limit."
      csvData={{
        headers: ["Category", "Spend", "Limit", "Percentage Used", "Status"],
        rows: budgets.map((b) => [b.category, b.currentSpend, b.monthlyLimit, Math.round(b.percentageUsed), b.status]),
      }}
    >
      {body}
    </ChartCard>
  );
}
