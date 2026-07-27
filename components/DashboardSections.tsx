"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import AddExpenseDialog from "@/components/AddExpenseDialog";
import AICoachCard from "@/components/AICoachCard";
import BudgetList from "@/components/BudgetList";
import CategoryBreakdown from "@/components/CategoryBreakdown";
import CompletedRecommendations from "@/components/CompletedRecommendations";
import DailySpendCard from "@/components/DailySpendCard";
import DashboardSummary from "@/components/DashboardSummary";
import { useDashboard } from "@/components/DashboardProvider";
import FinancialCopilot from "@/components/FinancialCopilot";
import ForecastCard from "@/components/ForecastCard";
import ForecastTable from "@/components/ForecastTable";
import ImportDialog from "@/components/ImportDialog";
import IntelligenceFeed from "@/components/IntelligenceFeed";
import InsightsSummary from "@/components/InsightsSummary";
import RecurringList from "@/components/RecurringList";
import ScenarioSimulator from "@/components/ScenarioSimulator";
import TimelineSection from "@/components/TimelineSection";
import { getAllMerchantProfiles } from "@/lib/merchant/knowledge";
import { getTransactions, reviewTransaction } from "@/lib/storage";
import type { ExplanationContext } from "@/types/explanation";
import type { FinancialState } from "@/types/financial-state";
import type { Category } from "@/types/transaction";

/**
 * Renders sections purely from the orchestrator's FinancialState. This
 * component never calls an engine directly — mutations go through Source
 * Plugins or the existing storage helpers, then trigger a rebuild via
 * useDashboard().refresh.
 */
export default function DashboardSections({ state }: { state: FinancialState }) {
  const { refresh } = useDashboard();

  // Built once per render, reused by every "Why?" button on this page —
  // the Explanation Engine never calls storage itself, so this is the one
  // place that assembles its context (mirroring how FinancialCopilot
  // assembles QueryDataSources).
  const explanationContext: ExplanationContext = useMemo(
    () => ({
      transactions: getTransactions(),
      budgets: state.budgets,
      events: state.events,
      recommendations: state.recommendations,
      recurring: state.recurring,
      merchantProfiles: getAllMerchantProfiles(),
      forecast: state.forecast,
      insights: state.insights,
      timeline: state.timeline,
      now: new Date(state.generatedAt),
    }),
    [state],
  );

  function handleReview(id: string, userCategory?: Category) {
    reviewTransaction(id, userCategory);
    refresh();
  }

  const hasTransactions = state.dashboardStats.totalTransactions > 0;
  const completedRecommendations = state.recommendations.filter(
    (r) => r.status === "completed",
  );

  return (
    <div className="flex flex-col gap-4">
      {hasTransactions && <DashboardSummary stats={state.dashboardStats} />}
      <div className="flex justify-end gap-2">
        <ImportDialog onImported={refresh} />
        <AddExpenseDialog onAdd={refresh} />
      </div>
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Insights</h2>
        {!hasTransactions ? (
          <Card>
            <CardContent>
              <p className="text-muted-foreground">
                No insights available yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <InsightsSummary insights={state.insights} explanationContext={explanationContext} />
            <CategoryBreakdown breakdown={state.insights.categoryBreakdown} />
          </>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Budgets</h2>
        <BudgetList
          statuses={state.budgets}
          onBudgetsChange={refresh}
          explanationContext={explanationContext}
        />
      </div>
      {hasTransactions && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Cash Flow Forecast
          </h2>
          <ForecastCard forecast={state.forecast} explanationContext={explanationContext} />
          <DailySpendCard forecast={state.forecast} />
          <ForecastTable categoryProjections={state.forecast.categoryProjections} />
          <ScenarioSimulator
            budgetStatuses={state.budgets}
            recurring={state.recurring}
            insights={state.insights}
            timeline={state.timeline}
          />
        </div>
      )}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Recurring Transactions
          </h2>
          <Link
            href="/recurring"
            className="text-muted-foreground text-sm hover:underline"
          >
            View all
          </Link>
        </div>
        <RecurringList items={state.recurring} explanationContext={explanationContext} />
      </div>
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Intelligence Feed
        </h2>
        <IntelligenceFeed
          items={state.feed}
          now={new Date(state.generatedAt)}
          explanationContext={explanationContext}
          onChange={refresh}
        />
        <CompletedRecommendations recommendations={completedRecommendations} />
      </div>
      <AICoachCard summary={state.coachSummary} />
      <FinancialCopilot state={state} />
      {!hasTransactions ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">No transactions yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {state.timeline.map((group) => (
            <TimelineSection
              key={group.key}
              group={group}
              onReview={handleReview}
              explanationContext={explanationContext}
            />
          ))}
        </div>
      )}
    </div>
  );
}
