import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import BudgetCard from "@/components/BudgetCard";
import BudgetDialog from "@/components/BudgetDialog";
import type { Budget, BudgetStatus } from "@/types/budget";
import type { ExplanationContext } from "@/types/explanation";

export default function BudgetList({
  statuses,
  onBudgetsChange,
  explanationContext,
}: {
  statuses: BudgetStatus[];
  onBudgetsChange: (budgets: Budget[]) => void;
  explanationContext: ExplanationContext;
}) {
  const existingCategories = statuses.map((s) => s.category);

  if (statuses.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-muted-foreground">No budgets created yet.</p>
          <BudgetDialog
            mode="create"
            existingCategories={existingCategories}
            onSave={onBudgetsChange}
            trigger={<Button>Create Budget</Button>}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <BudgetDialog
          mode="create"
          existingCategories={existingCategories}
          onSave={onBudgetsChange}
          trigger={
            <Button variant="outline" size="sm">
              Add Budget
            </Button>
          }
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {statuses.map((status) => (
          <BudgetCard
            key={status.id}
            status={status}
            onBudgetsChange={onBudgetsChange}
            explanationContext={explanationContext}
          />
        ))}
      </div>
    </div>
  );
}
