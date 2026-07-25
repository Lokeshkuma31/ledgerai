"use client";

import { Card, CardContent } from "@/components/ui/card";
import AddExpenseDialog from "@/components/AddExpenseDialog";
import AICoachCard from "@/components/AICoachCard";
import BudgetList from "@/components/BudgetList";
import CategoryBreakdown from "@/components/CategoryBreakdown";
import CompletedRecommendations from "@/components/CompletedRecommendations";
import DashboardSummary from "@/components/DashboardSummary";
import { useDashboard } from "@/components/DashboardProvider";
import FinancialEvents from "@/components/FinancialEvents";
import InsightsSummary from "@/components/InsightsSummary";
import RecommendationList from "@/components/RecommendationList";
import TimelineSection from "@/components/TimelineSection";
import { completeRecommendation, dismissRecommendation } from "@/lib/decision/storage";
import { addTransaction, reviewTransaction } from "@/lib/storage";
import type { FinancialState } from "@/types/financial-state";
import type { Recommendation } from "@/types/recommendation";
import type { Category, Transaction } from "@/types/transaction";

/**
 * Renders sections purely from the orchestrator's FinancialState. This
 * component never calls an engine directly — mutations go through the
 * existing storage helpers, then trigger a rebuild via useDashboard().refresh.
 */
export default function DashboardSections({ state }: { state: FinancialState }) {
  const { refresh } = useDashboard();

  function handleAdd(transaction: Transaction) {
    addTransaction(transaction);
    refresh();
  }

  function handleReview(id: string, userCategory?: Category) {
    reviewTransaction(id, userCategory);
    refresh();
  }

  function handleDismissRecommendation(recommendation: Recommendation) {
    dismissRecommendation(recommendation.id, recommendation.createdAt);
    refresh();
  }

  function handleCompleteRecommendation(recommendation: Recommendation) {
    completeRecommendation(recommendation.id, recommendation.createdAt);
    refresh();
  }

  const hasTransactions = state.dashboardStats.totalTransactions > 0;
  const activeRecommendations = state.recommendations.filter(
    (r) => r.status === "new",
  );
  const completedRecommendations = state.recommendations.filter(
    (r) => r.status === "completed",
  );

  return (
    <div className="flex flex-col gap-4">
      {hasTransactions && <DashboardSummary stats={state.dashboardStats} />}
      <div className="flex justify-end">
        <AddExpenseDialog onAdd={handleAdd} />
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
            <InsightsSummary insights={state.insights} />
            <CategoryBreakdown breakdown={state.insights.categoryBreakdown} />
          </>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Budgets</h2>
        <BudgetList statuses={state.budgets} onBudgetsChange={refresh} />
      </div>
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Financial Events
        </h2>
        <FinancialEvents events={state.events} />
      </div>
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Recommendations
        </h2>
        <RecommendationList
          recommendations={activeRecommendations}
          onDismiss={handleDismissRecommendation}
          onComplete={handleCompleteRecommendation}
        />
        <CompletedRecommendations recommendations={completedRecommendations} />
      </div>
      <AICoachCard summary={state.coachSummary} />
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
