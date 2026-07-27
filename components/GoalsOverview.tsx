"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import GoalCard from "@/components/GoalCard";
import GoalForm from "@/components/GoalForm";
import GoalStatistics from "@/components/GoalStatistics";
import { calculateBudgetStatus } from "@/lib/budget/engine";
import { getBudgets } from "@/lib/budget/storage";
import { generateForecast } from "@/lib/forecast/engine";
import { computeGoalProgress } from "@/lib/goals/engine";
import { getGoals } from "@/lib/goals/storage";
import { generateInsights } from "@/lib/insights/engine";
import { getAllMerchantProfiles } from "@/lib/merchant/knowledge";
import { detectRecurringTransactions } from "@/lib/recurring/engine";
import { getTransactions } from "@/lib/storage";
import { generateTimeline } from "@/lib/timeline/engine";
import type { Goal, GoalProgress } from "@/types/goal";

/** Independently recomputes just enough of the Cash Flow Forecast Engine's
 * output (expectedSavings) to show "on track" messaging — mirrors the
 * pattern RecurringOverview.tsx/SearchOverview.tsx already use for their
 * own client-side recomputes, since this page has no DashboardProvider. */
function computeProjectedMonthlySavings(): number {
  const now = new Date();
  const transactions = getTransactions();
  const merchantProfiles = getAllMerchantProfiles();
  const budgetStatuses = calculateBudgetStatus(getBudgets(), transactions, now);
  const insights = generateInsights(transactions);
  const timeline = generateTimeline(transactions, now);
  const { items: recurring } = detectRecurringTransactions(transactions, merchantProfiles, now);
  const forecast = generateForecast(transactions, recurring, budgetStatuses, insights, timeline, now);
  return forecast.expectedSavings;
}

export default function GoalsOverview() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projectedMonthlySavings, setProjectedMonthlySavings] = useState<number | null>(null);

  useEffect(() => {
    setGoals(getGoals());
    setProjectedMonthlySavings(getTransactions().length > 0 ? computeProjectedMonthlySavings() : null);
  }, []);

  const progressById = useMemo(() => {
    const now = new Date();
    const map = new Map<string, GoalProgress>();
    for (const goal of goals) {
      map.set(goal.id, computeGoalProgress(goal, now, projectedMonthlySavings));
    }
    return map;
  }, [goals, projectedMonthlySavings]);

  return (
    <div className="flex flex-col gap-4">
      <GoalStatistics goals={goals} progressById={progressById} />
      <div className="flex justify-end">
        <GoalForm mode="create" onSave={setGoals} trigger={<Button>Create Goal</Button>} />
      </div>
      {goals.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">No savings goals yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              progress={progressById.get(goal.id)!}
              onChange={setGoals}
            />
          ))}
        </div>
      )}
    </div>
  );
}
