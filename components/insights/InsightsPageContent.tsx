"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CategoryBarChart from "@/components/insights/CategoryBarChart";
import CategoryBreakdown from "@/components/CategoryBreakdown";
import { useDashboard } from "@/components/DashboardProvider";
import InsightsSummary from "@/components/InsightsSummary";
import { useExplanationContext } from "@/hooks/use-explanation-context";

export default function InsightsPageContent() {
  const { state } = useDashboard();
  const explanationContext = useExplanationContext(state);

  if (!state || !explanationContext) {
    return <p className="text-muted-foreground py-16 text-center">Loading your insights...</p>;
  }

  if (state.dashboardStats.totalTransactions === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">No insights available yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <InsightsSummary insights={state.insights} explanationContext={explanationContext} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spending by Category</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CategoryBarChart breakdown={state.insights.categoryBreakdown} />
          <CategoryBreakdown breakdown={state.insights.categoryBreakdown} />
        </CardContent>
      </Card>
    </div>
  );
}
