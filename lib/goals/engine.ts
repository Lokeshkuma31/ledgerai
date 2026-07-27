import type { Goal, GoalCoachSummary, GoalProgress, GoalStatus } from "@/types/goal";

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/**
 * Deterministic — no LLM, no estimation. Always derived live from
 * currentAmount/targetAmount/targetDate rather than trusted from whatever
 * was last persisted, since "Overdue" depends on today's date and can
 * change with no edit to the goal itself.
 */
export function deriveGoalStatus(goal: Goal, now: Date = new Date()): GoalStatus {
  if (goal.currentAmount >= goal.targetAmount) return "completed";
  if (daysBetween(now, parseLocalDate(goal.targetDate)) < 0) return "overdue";
  if (goal.currentAmount <= 0) return "not-started";
  return "in-progress";
}

/**
 * Computes everything a goal card/page needs to render — progress,
 * remaining amount, days remaining, and the daily/monthly pace required to
 * hit the target on time. `projectedMonthlySavings`, when provided, is the
 * Cash Flow Forecast Engine's own expectedSavings — this function only
 * compares against it, it never recomputes a forecast itself.
 */
export function computeGoalProgress(
  goal: Goal,
  now: Date = new Date(),
  projectedMonthlySavings: number | null = null,
): GoalProgress {
  const status = deriveGoalStatus(goal, now);
  const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount);
  const percentComplete = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
  const daysRemaining = daysBetween(now, parseLocalDate(goal.targetDate));

  const daysLeftForPace = Math.max(daysRemaining, 0);
  const dailySavingsNeeded = daysLeftForPace > 0 ? remainingAmount / daysLeftForPace : remainingAmount;
  const monthlySavingsNeeded = dailySavingsNeeded * 30;

  let message: string;
  let onTrack: boolean | null = null;

  if (status === "completed") {
    message = "Goal reached!";
  } else if (status === "overdue") {
    message = `This goal's target date has passed with ${formatCurrency(remainingAmount)} still to go.`;
  } else if (projectedMonthlySavings === null) {
    message = `Save about ${formatCurrency(monthlySavingsNeeded)}/month to reach this goal on time.`;
  } else {
    onTrack = projectedMonthlySavings >= monthlySavingsNeeded;
    message = onTrack
      ? "You are on track."
      : `You need to save approximately ${formatCurrency(monthlySavingsNeeded)}/month to reach this goal.`;
  }

  return {
    percentComplete,
    remainingAmount,
    daysRemaining,
    dailySavingsNeeded,
    monthlySavingsNeeded,
    status,
    message,
    onTrack,
  };
}

/** What the AI Financial Coach receives — a trimmed, already-computed
 * summary. The Coach narrates this; it never calculates goal progress. */
export function toGoalCoachSummary(goal: Goal, progress: GoalProgress): GoalCoachSummary {
  return {
    name: goal.name,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    percentComplete: Math.round(progress.percentComplete * 10) / 10,
    daysRemaining: progress.daysRemaining,
    status: progress.status,
    monthlySavingsNeeded: Math.round(progress.monthlySavingsNeeded),
  };
}
