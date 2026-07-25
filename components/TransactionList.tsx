"use client";

import { useEffect, useReducer, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import AddExpenseDialog from "@/components/AddExpenseDialog";
import AICoachCard from "@/components/AICoachCard";
import BudgetList from "@/components/BudgetList";
import CategoryBreakdown from "@/components/CategoryBreakdown";
import CompletedRecommendations from "@/components/CompletedRecommendations";
import DashboardSummary from "@/components/DashboardSummary";
import FinancialEvents from "@/components/FinancialEvents";
import InsightsSummary from "@/components/InsightsSummary";
import RecommendationList from "@/components/RecommendationList";
import TimelineSection from "@/components/TimelineSection";
import { calculateBudgetStatus } from "@/lib/budget/engine";
import { getBudgets } from "@/lib/budget/storage";
import { generateRecommendations } from "@/lib/decision/engine";
import {
  applyPersistedStatus,
  completeRecommendation,
  dismissRecommendation,
} from "@/lib/decision/storage";
import { detectFinancialEvents } from "@/lib/events/engine";
import { generateInsights } from "@/lib/insights/engine";
import { generateTimeline } from "@/lib/timeline/engine";
import {
  addTransaction,
  getTransactions,
  reviewTransaction,
} from "@/lib/storage";
import type { Budget } from "@/types/budget";
import type { Recommendation } from "@/types/recommendation";
import type { Category, Transaction } from "@/types/transaction";

export default function TransactionList() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [, refreshRecommendationStatus] = useReducer((c: number) => c + 1, 0);

  useEffect(() => {
    setTransactions(getTransactions());
    setBudgets(getBudgets());
  }, []);

  function handleAdd(transaction: Transaction) {
    setTransactions(addTransaction(transaction));
  }

  function handleReview(id: string, userCategory?: Category) {
    setTransactions(reviewTransaction(id, userCategory));
  }

  function handleDismissRecommendation(recommendation: Recommendation) {
    dismissRecommendation(recommendation.id, recommendation.createdAt);
    refreshRecommendationStatus();
  }

  function handleCompleteRecommendation(recommendation: Recommendation) {
    completeRecommendation(recommendation.id, recommendation.createdAt);
    refreshRecommendationStatus();
  }

  const insights = generateInsights(transactions);
  const timeline = generateTimeline(transactions);
  const budgetStatuses = calculateBudgetStatus(budgets, transactions);
  const events = detectFinancialEvents(transactions, { budgetStatuses });
  const recommendations = applyPersistedStatus(
    generateRecommendations({ transactions, budgets, events, insights, timeline }),
  );
  const activeRecommendations = recommendations.filter(
    (r) => r.status === "new",
  );
  const completedRecommendations = recommendations.filter(
    (r) => r.status === "completed",
  );

  return (
    <div className="flex flex-col gap-4">
      {transactions.length > 0 && (
        <DashboardSummary transactions={transactions} />
      )}
      <div className="flex justify-end">
        <AddExpenseDialog onAdd={handleAdd} />
      </div>
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Insights</h2>
        {transactions.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-muted-foreground">
                No insights available yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <InsightsSummary insights={insights} />
            <CategoryBreakdown breakdown={insights.categoryBreakdown} />
          </>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Budgets</h2>
        <BudgetList
          budgets={budgets}
          statuses={budgetStatuses}
          onBudgetsChange={setBudgets}
        />
      </div>
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Financial Events
        </h2>
        <FinancialEvents events={events} />
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
      <AICoachCard
        transactions={transactions}
        budgetStatuses={budgetStatuses}
        events={events}
        recommendations={activeRecommendations}
      />
      {transactions.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">No transactions yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {timeline.map((group) => (
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
