"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { simulateScenario } from "@/lib/forecast/simulator";
import { getTransactions } from "@/lib/storage";
import type { Insights } from "@/lib/insights/engine";
import type { TimelineGroup } from "@/lib/timeline/engine";
import type { BudgetStatus } from "@/types/budget";
import type { ScenarioAdjustments } from "@/types/forecast";
import type { RecurringTransaction } from "@/types/recurring";

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function toOverride(raw: string): number | undefined {
  return raw === "" ? undefined : Number(raw);
}

export default function ScenarioSimulator({
  budgetStatuses,
  recurring,
  insights,
  timeline,
}: {
  budgetStatuses: BudgetStatus[];
  recurring: RecurringTransaction[];
  insights: Insights;
  timeline: TimelineGroup[];
}) {
  const [foodSpending, setFoodSpending] = useState("");
  const [shoppingSpending, setShoppingSpending] = useState("");
  const [recurringExpenses, setRecurringExpenses] = useState("");
  const [income, setIncome] = useState("");
  const [savingsGoal, setSavingsGoal] = useState("");

  const result = useMemo(() => {
    const adjustments: ScenarioAdjustments = {
      foodSpending: toOverride(foodSpending),
      shoppingSpending: toOverride(shoppingSpending),
      recurringExpenses: toOverride(recurringExpenses),
      income: toOverride(income),
      savingsGoal: toOverride(savingsGoal),
    };
    const hasAdjustment = Object.values(adjustments).some((v) => v !== undefined);
    if (!hasAdjustment) return null;
    return simulateScenario(
      getTransactions(),
      recurring,
      budgetStatuses,
      insights,
      timeline,
      adjustments,
    );
  }, [
    foodSpending,
    shoppingSpending,
    recurringExpenses,
    income,
    savingsGoal,
    recurring,
    budgetStatuses,
    insights,
    timeline,
  ]);

  function handleReset() {
    setFoodSpending("");
    setShoppingSpending("");
    setRecurringExpenses("");
    setIncome("");
    setSavingsGoal("");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">What If?</CardTitle>
        <Button variant="outline" size="sm" onClick={handleReset}>
          Reset
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="what-if-food" className="text-xs">
              Monthly Food Spending
            </Label>
            <Input
              id="what-if-food"
              type="number"
              placeholder="Current"
              value={foodSpending}
              onChange={(e) => setFoodSpending(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="what-if-shopping" className="text-xs">
              Shopping Spending
            </Label>
            <Input
              id="what-if-shopping"
              type="number"
              placeholder="Current"
              value={shoppingSpending}
              onChange={(e) => setShoppingSpending(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="what-if-recurring" className="text-xs">
              Recurring Expenses
            </Label>
            <Input
              id="what-if-recurring"
              type="number"
              placeholder="Current"
              value={recurringExpenses}
              onChange={(e) => setRecurringExpenses(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="what-if-income" className="text-xs">
              Income
            </Label>
            <Input
              id="what-if-income"
              type="number"
              placeholder="Current"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="what-if-savings-goal" className="text-xs">
              Savings Goal
            </Label>
            <Input
              id="what-if-savings-goal"
              type="number"
              placeholder="Optional"
              value={savingsGoal}
              onChange={(e) => setSavingsGoal(e.target.value)}
            />
          </div>
        </div>

        {result ? (
          <div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm sm:grid-cols-4">
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs">Projected Balance</span>
              <span className="font-semibold">
                {formatAmount(result.forecast.projectedEndOfMonthBalance)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs">Expected Savings</span>
              <span className="font-semibold">{formatAmount(result.forecast.expectedSavings)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs">Daily Safe Spend</span>
              <span className="font-semibold">
                {formatAmount(result.forecast.dailySafeSpend)}/day
              </span>
            </div>
            {result.savingsGoalGap !== null && (
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs">
                  {result.savingsGoalGap >= 0 ? "Above Goal" : "Below Goal"}
                </span>
                <span
                  className={
                    result.savingsGoalGap >= 0
                      ? "font-semibold text-emerald-600 dark:text-emerald-400"
                      : "text-destructive font-semibold"
                  }
                >
                  {formatAmount(Math.abs(result.savingsGoalGap))}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            Adjust any value above to see how it changes your projected
            month-end outcome. Nothing here is saved.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
