"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import BudgetDonut from "@/components/budgets/BudgetDonut";
import BudgetList from "@/components/BudgetList";
import { useDashboard } from "@/components/DashboardProvider";
import { useExplanationContext } from "@/hooks/use-explanation-context";

export default function BudgetsPageContent() {
  const { state, refresh } = useDashboard();
  const explanationContext = useExplanationContext(state);

  if (!state || !explanationContext) {
    return <p className="text-muted-foreground py-16 text-center">Loading your budgets...</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">This Month&apos;s Spending</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetDonut statuses={state.budgets} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Budgets by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetList
            statuses={state.budgets}
            onBudgetsChange={refresh}
            explanationContext={explanationContext}
          />
        </CardContent>
      </Card>
    </div>
  );
}
