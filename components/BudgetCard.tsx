import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import BudgetDialog from "@/components/BudgetDialog";
import BudgetProgress from "@/components/BudgetProgress";
import WhyButton from "@/components/WhyButton";
import { explainBudget } from "@/lib/explanations/engine";
import type { Budget, BudgetStatus } from "@/types/budget";
import type { ExplanationContext } from "@/types/explanation";

function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default function BudgetCard({
  status,
  onBudgetsChange,
  explanationContext,
}: {
  status: BudgetStatus;
  onBudgetsChange: (budgets: Budget[]) => void;
  explanationContext: ExplanationContext;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-medium">{status.category}</span>
          <div className="flex items-center gap-1">
            <WhyButton explain={() => explainBudget(status, explanationContext)} />
            <BudgetDialog
              mode="edit"
              budgetId={status.id}
              category={status.category}
              currentLimit={status.monthlyLimit}
              onSave={onBudgetsChange}
              trigger={
                <Button variant="outline" size="sm">
                  Edit
                </Button>
              }
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Limit</span>
            <span className="font-semibold">
              {formatCurrency(status.monthlyLimit)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Spent</span>
            <span className="font-semibold">
              {formatCurrency(status.currentSpend)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Remaining</span>
            <span className="font-semibold">
              {formatCurrency(status.remainingAmount)}
            </span>
          </div>
        </div>
        <BudgetProgress status={status} />
        <p className="text-muted-foreground text-xs">
          {status.transactionCount}{" "}
          {status.transactionCount === 1 ? "transaction" : "transactions"} ·{" "}
          {status.daysRemainingThisMonth} days left this month
        </p>
      </CardContent>
    </Card>
  );
}
