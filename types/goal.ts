export const GOAL_STATUSES = ["not-started", "in-progress", "completed", "overdue"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  /** "YYYY-MM-DD" */
  targetDate: string;
  /** Emoji, matching the app's icon convention elsewhere. */
  icon: string;
  /** A CSS color value (e.g. a hex code) used for the progress bar. */
  color: string;
  status: GoalStatus;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Everything a goal card/page needs to render — computed fresh by
 * lib/goals/engine.ts, never trusted from whatever was last persisted,
 * since "Overdue" depends on today's date and can change with no edit to
 * the goal itself.
 */
export interface GoalProgress {
  /** 0-100+, unrounded. */
  percentComplete: number;
  remainingAmount: number;
  /** Negative once the target date has passed. */
  daysRemaining: number;
  dailySavingsNeeded: number;
  monthlySavingsNeeded: number;
  status: GoalStatus;
  /** "You are on track." / "You need to save ~₹X/month..." — compares
   * monthlySavingsNeeded against the Cash Flow Forecast Engine's own
   * projected savings; never recomputes a forecast itself. */
  message: string;
  /** Null when there's no forecast data to compare against. */
  onTrack: boolean | null;
}

/** What the AI Financial Coach receives — already-computed. The Coach
 * narrates these; it never calculates goal progress itself. */
export interface GoalCoachSummary {
  name: string;
  targetAmount: number;
  currentAmount: number;
  percentComplete: number;
  daysRemaining: number;
  status: GoalStatus;
  monthlySavingsNeeded: number;
}
