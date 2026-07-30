"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DailySpendCard from "@/components/DailySpendCard";
import { useDashboard } from "@/components/DashboardProvider";
import ForecastCard from "@/components/ForecastCard";
import ForecastTable from "@/components/ForecastTable";
import ScenarioSimulator from "@/components/ScenarioSimulator";
import { useExplanationContext } from "@/hooks/use-explanation-context";

export default function ForecastPageContent() {
  const { state } = useDashboard();
  const explanationContext = useExplanationContext(state);

  if (!state || !explanationContext) {
    return <p className="text-muted-foreground py-16 text-center">Loading your forecast...</p>;
  }

  if (state.dashboardStats.totalTransactions === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">
            Add some transactions to see a cash flow forecast.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ForecastCard forecast={state.forecast} explanationContext={explanationContext} />
      <DailySpendCard forecast={state.forecast} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Category Projections</CardTitle>
        </CardHeader>
        <CardContent>
          <ForecastTable categoryProjections={state.forecast.categoryProjections} />
        </CardContent>
      </Card>
      <ScenarioSimulator
        budgetStatuses={state.budgets}
        recurring={state.recurring}
        insights={state.insights}
        timeline={state.timeline}
      />
    </div>
  );
}
