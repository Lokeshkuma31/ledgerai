import { calculateBudgetStatus } from "@/lib/budget/engine";
import type { Insights } from "@/lib/insights/engine";
import type { TimelineGroup } from "@/lib/timeline/engine";
import type { Budget, BudgetStatus } from "@/types/budget";
import type { FinancialEvent } from "@/types/event";
import type { Recommendation } from "@/types/recommendation";
import type { Transaction } from "@/types/transaction";

const BUDGET_HIGH_USAGE_THRESHOLD = 90;
const BUDGET_LOW_USAGE_THRESHOLD = 30;

const PRIORITY_RANK: Record<Recommendation["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface GenerateRecommendationsInput {
  transactions: Transaction[];
  budgets: Budget[];
  events: FinancialEvent[];
  insights: Insights;
  /** Reserved for future rules (e.g. Forecast); not consumed by the current rule set. */
  timeline: TimelineGroup[];
  now?: Date;
}

function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentMonthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function relativeDayLabel(dateStr: string, now: Date): string {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dateStr === formatDate(now)) return "Today";
  if (dateStr === formatDate(yesterday)) return "Yesterday";
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function baseRecommendation(
  id: string,
  now: Date,
  fields: Omit<Recommendation, "id" | "createdAt" | "status">,
): Recommendation {
  return {
    id,
    createdAt: now.toISOString(),
    status: "new",
    ...fields,
  };
}

/**
 * Budget → Recommendation rules: reduce spending once a budget crosses 90%,
 * praise comfortably-under-budget categories, and prompt creating a budget
 * when none exist. Ids are scoped to the current month so a dismissed
 * recommendation reappears if the same situation recurs next month.
 */
function recommendBudgetActions(
  budgetStatuses: BudgetStatus[],
  insights: Insights,
  now: Date,
): Recommendation[] {
  const monthKey = currentMonthKey(now);
  const recommendations: Recommendation[] = [];

  for (const status of budgetStatuses) {
    if (status.percentageUsed >= BUDGET_HIGH_USAGE_THRESHOLD) {
      recommendations.push(
        baseRecommendation(`budget-reduce:${status.id}:${monthKey}`, now, {
          title: `Reduce ${status.category} spending this week`,
          description: `Reduce ${status.category} spending this week.`,
          priority: status.percentageUsed > 100 ? "critical" : "high",
          category: "Budget",
          reason: `You've used ${Math.round(status.percentageUsed)}% of your ${formatCurrency(status.monthlyLimit)} ${status.category} budget this month.`,
          action: `Cut back on ${status.category} purchases until next month.`,
        }),
      );
    } else if (status.percentageUsed < BUDGET_LOW_USAGE_THRESHOLD) {
      recommendations.push(
        baseRecommendation(`budget-low-usage:${status.id}:${monthKey}`, now, {
          title: "On track with your budget",
          description:
            "You are comfortably within your monthly limits. Keep maintaining this pattern.",
          priority: "low",
          category: "Budget",
          reason: `You've used only ${Math.round(status.percentageUsed)}% of your ${status.category} budget this month.`,
          action: "Keep up your current spending habits.",
        }),
      );
    }
  }

  if (budgetStatuses.length === 0 && insights.categoryBreakdown.length > 0) {
    const topCategory = insights.categoryBreakdown[0];
    recommendations.push(
      baseRecommendation(`budget-missing:${topCategory.category}:${monthKey}`, now, {
        title: "Create a budget for your top spending category",
        description: "Create a monthly budget for your highest spending category.",
        priority: "medium",
        category: "Budget",
        reason: `${topCategory.category} accounts for ${Math.round(topCategory.percentage)}% of your total spending.`,
        action: `Set a monthly limit for ${topCategory.category}.`,
      }),
    );
  }

  return recommendations;
}

/** Recurring Expense → Recommendation: prompt a review of the subscription. */
function recommendRecurringExpenses(
  events: FinancialEvent[],
  now: Date,
): Recommendation[] {
  return events
    .filter((e) => e.type === "recurring-expense")
    .map((e) =>
      baseRecommendation(`recommend-recurring:${e.id}`, now, {
        title: "Review recurring payment",
        description: "Determine whether it is still needed.",
        priority: "low",
        category: "Subscriptions",
        reason: e.description,
        action: "Cancel or downgrade this subscription if it's no longer providing value.",
      }),
    );
}

/** Large Expense → Recommendation: confirm whether the purchase was planned. */
function recommendLargeExpenses(
  events: FinancialEvent[],
  now: Date,
): Recommendation[] {
  return events
    .filter((e) => e.type === "large-expense")
    .map((e) =>
      baseRecommendation(`recommend-large-expense:${e.id}`, now, {
        title: "Review this large purchase",
        description:
          "Consider marking this purchase as a planned expense if it was intentional.",
        priority: "medium",
        category: "Spending",
        reason: e.description,
        action: "Mark it as planned if intentional, or flag it for review if unexpected.",
      }),
    );
}

/** High Spending Day → Recommendation: flag unusually high daily spend. */
function recommendHighSpendingDays(
  events: FinancialEvent[],
  now: Date,
): Recommendation[] {
  return events
    .filter((e) => e.type === "high-spending-day")
    .map((e) =>
      baseRecommendation(`recommend-high-spending-day:${e.id}`, now, {
        title: "Unusually high spending day",
        description: `${relativeDayLabel(e.date, now)}'s spending was unusually high. Review discretionary purchases.`,
        priority: "medium",
        category: "Spending",
        reason: e.description,
        action: "Review what drove the extra spending and avoid repeating it if unplanned.",
      }),
    );
}

/** Weekend Spending → Recommendation: monitor discretionary weekend spend. */
function recommendWeekendSpending(
  events: FinancialEvent[],
  now: Date,
): Recommendation[] {
  return events
    .filter((e) => e.type === "weekend-spending")
    .map((e) =>
      baseRecommendation(`recommend-weekend-spending:${e.id}`, now, {
        title: "Weekend spending is high",
        description:
          "Weekend spending is significantly higher than weekdays. Monitor discretionary expenses.",
        priority: "low",
        category: "Habits",
        reason: e.description,
        action: "Set a soft spending limit for weekends.",
      }),
    );
}

/** Salary Received → Recommendation: nudge savings allocation before spending. */
function recommendSavings(
  events: FinancialEvent[],
  now: Date,
): Recommendation[] {
  return events
    .filter((e) => e.type === "salary-received")
    .map((e) =>
      baseRecommendation(`recommend-savings:${e.id}`, now, {
        title: "Put part of this income toward savings",
        description:
          "Allocate part of your recent income toward savings before discretionary spending.",
        priority: "medium",
        category: "Savings",
        reason: e.description,
        action: "Transfer a fixed percentage of this income to savings now.",
      }),
    );
}

function sortByPriorityDesc(recommendations: Recommendation[]): Recommendation[] {
  return [...recommendations].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
}

/**
 * Deterministic, pure TypeScript — no React, no LLM. Converts Insights,
 * Budget Engine output, and Events Engine output into actionable, prioritized
 * recommendations. The AI Financial Coach explains these; it never invents
 * new ones.
 */
export function generateRecommendations(
  input: GenerateRecommendationsInput,
): Recommendation[] {
  const now = input.now ?? new Date();
  const budgetStatuses = calculateBudgetStatus(input.budgets, input.transactions, now);

  const recommendations: Recommendation[] = [
    ...recommendBudgetActions(budgetStatuses, input.insights, now),
    ...recommendRecurringExpenses(input.events, now),
    ...recommendLargeExpenses(input.events, now),
    ...recommendHighSpendingDays(input.events, now),
    ...recommendWeekendSpending(input.events, now),
    ...recommendSavings(input.events, now),
  ];

  return sortByPriorityDesc(recommendations);
}
