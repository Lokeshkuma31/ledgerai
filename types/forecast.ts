export const FORECAST_RISK_LEVELS = ["Safe", "Watch", "High Risk", "Critical"] as const;
export type ForecastRiskLevel = (typeof FORECAST_RISK_LEVELS)[number];

export interface CategoryProjection {
  category: string;
  /** Month-to-date actual spend. */
  currentSpend: number;
  /** Extrapolated to month-end at the category's current daily rate. */
  projectedSpend: number;
  /** null when no budget is configured for this category. */
  budgetLimit: number | null;
  projectedPercentageUsed: number | null;
  riskLevel: ForecastRiskLevel;
}

export interface CashFlowForecast {
  /** Derived proxy from all-time recorded income minus expenses — this app
   * has no bank integration, so it's an estimate, not a real balance. */
  currentBalanceEstimate: number;
  projectedEndOfMonthBalance: number;
  expectedIncome: number;
  expectedExpenses: number;
  expectedSavings: number;
  dailySafeSpend: number;
  confidence: number; // 0-1
  forecastGeneratedAt: string; // ISO 8601
  daysRemaining: number;
  categoryProjections: CategoryProjection[];
}

export interface ForecastStatistics {
  /** null when there isn't a full previous month of history to backtest against. */
  forecastAccuracy: number | null;
  savingsRate: number; // expectedSavings / expectedIncome, 0-1 (can be negative)
  expenseGrowth: number; // fractional change vs previous month
  incomeGrowth: number;
  netCashFlow: number;
  /** Average projected budget utilization across budgeted categories, 0-1+. */
  budgetUtilizationForecast: number;
}

/** The five knobs the Scenario Simulator exposes — all optional, all
 * override the deterministic baseline for a single what-if recompute.
 * Nothing derived from these is ever persisted. */
export interface ScenarioAdjustments {
  foodSpending?: number;
  shoppingSpending?: number;
  recurringExpenses?: number;
  income?: number;
  savingsGoal?: number;
}

export interface ScenarioResult {
  forecast: CashFlowForecast;
  /** expectedSavings - savingsGoal; null when no goal was provided. */
  savingsGoalGap: number | null;
}

/** What the AI Financial Coach receives — never asked to calculate any of
 * this itself. */
export interface ForecastCoachSummary {
  projectedEndOfMonthBalance: number;
  expectedIncome: number;
  expectedExpenses: number;
  expectedSavings: number;
  dailySafeSpend: number;
  confidence: number;
  daysRemaining: number;
  categoryRisks: {
    category: string;
    riskLevel: ForecastRiskLevel;
    projectedPercentageUsed: number | null;
  }[];
}
