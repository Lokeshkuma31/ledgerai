import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import BudgetDialog from "@/components/BudgetDialog";
import BudgetProgress from "@/components/BudgetProgress";
import type { Budget, BudgetStatus } from "@/types/budget";

function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default function BudgetCard({
  status,
  onBudgetsChange,
}: {
  status: BudgetStatus;
  onBudgetsChange: (budgets: Budget[]) => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-medium">{status.category}</span>
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
