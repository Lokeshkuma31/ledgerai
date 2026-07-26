import { calculateTotals, getMonthWindow, type CalculatedTotals } from "@/lib/forecast/calculator";
import {
  computeConfidence,
  computeDailySafeSpend,
  projectCategorySpending,
  projectEndOfMonthBalance,
  projectExpectedExpenses,
  projectExpectedIncome,
} from "@/lib/forecast/projector";
import { classifyRisk } from "@/lib/forecast/risk";
import type { Insights } from "@/lib/insights/engine";
import type { TimelineGroup } from "@/lib/timeline/engine";
import type { BudgetStatus } from "@/types/budget";
import type {
  CashFlowForecast,
  CategoryProjection,
  ScenarioAdjustments,
  ScenarioResult,
} from "@/types/forecast";
import type { RecurringTransaction } from "@/types/recurring";
import type { Transaction } from "@/types/transaction";

function overrideForCategory(category: string, adjustments: ScenarioAdjustments): number | undefined {
  if (category === "Food") return adjustments.foodSpending;
  if (category === "Shopping") return adjustments.shoppingSpending;
  return undefined;
}

/**
 * Recomputes a full forecast under user-supplied "what if" adjustments —
 * pure function, same engine math as engine.ts, nothing written anywhere.
 * The simulator is temporary by construction: call it again with
 * different adjustments and the previous result is simply discarded.
 */
export function simulateScenario(
  transactions: Transaction[],
  recurring: RecurringTransaction[],
  budgetStatuses: BudgetStatus[],
  insights: Insights,
  timeline: TimelineGroup[],
  adjustments: ScenarioAdjustments,
  now: Date = new Date(),
): ScenarioResult {
  const window = getMonthWindow(now);
  const totals = calculateTotals(transactions, recurring, budgetStatuses, timeline, window);
  const baselineProjections = projectCategorySpending(budgetStatuses, window);

  const adjustedTotals: CalculatedTotals = {
    ...totals,
    incomeRemaining:
      adjustments.income !== undefined
        ? Math.max(0, adjustments.income - totals.incomeSoFar)
        : totals.incomeRemaining,
    recurringExpensesRemaining: adjustments.recurringExpenses ?? totals.recurringExpensesRemaining,
  };

  let categoryDelta = 0;
  const categoryProjections: CategoryProjection[] = baselineProjections.map((projection) => {
    const override = overrideForCategory(projection.category, adjustments);
    if (override === undefined) return projection;
    categoryDelta += override - projection.projectedSpend;
    const projectedPercentageUsed =
      projection.budgetLimit && projection.budgetLimit > 0
        ? (override / projection.budgetLimit) * 100
        : null;
    return {
      ...projection,
      projectedSpend: override,
      projectedPercentageUsed,
      riskLevel: classifyRisk(projectedPercentageUsed),
    };
  });

  const expectedIncome = projectExpectedIncome(adjustedTotals);
  const expectedExpenses = projectExpectedExpenses(adjustedTotals, window) + categoryDelta;
  const expectedSavings = expectedIncome - expectedExpenses;
  const projectedEndOfMonthBalance = projectEndOfMonthBalance(adjustedTotals, expectedExpenses);
  const dailySafeSpend = computeDailySafeSpend(adjustedTotals, window);
  const confidence = computeConfidence(window, insights.totalTransactions);

  const forecast: CashFlowForecast = {
    currentBalanceEstimate: totals.currentBalanceEstimate,
    projectedEndOfMonthBalance,
    expectedIncome,
    expectedExpenses,
    expectedSavings,
    dailySafeSpend,
    confidence,
    forecastGeneratedAt: now.toISOString(),
    daysRemaining: window.daysRemaining,
    categoryProjections,
  };

  return {
    forecast,
    savingsGoalGap:
      adjustments.savingsGoal !== undefined ? expectedSavings - adjustments.savingsGoal : null,
  };
}
