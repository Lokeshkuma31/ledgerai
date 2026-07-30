"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AddExpenseDialog from "@/components/AddExpenseDialog";
import BudgetsMini from "@/components/dashboard/BudgetsMini";
import CashFlowChart from "@/components/dashboard/CashFlowChart";
import ConnectionsMini from "@/components/dashboard/ConnectionsMini";
import MetricCard from "@/components/dashboard/MetricCard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import UpcomingBills from "@/components/dashboard/UpcomingBills";
import { useDashboard } from "@/components/DashboardProvider";
import ImportDialog from "@/components/ImportDialog";
import RecommendationCard from "@/components/RecommendationCard";
import { generateMonthlyCashFlow } from "@/lib/timeline/monthly";
import { getTransactions } from "@/lib/storage";
import type { ConnectionRecord } from "@/lib/connections/types";

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function growthBadge(growth: number): { text: string; tone: "up" | "down" | "neutral" } {
  if (!Number.isFinite(growth) || growth === 0) return { text: "No change vs last month", tone: "neutral" };
  const pct = Math.round(Math.abs(growth) * 100);
  return { text: `${growth > 0 ? "+" : "-"}${pct}% vs last month`, tone: growth > 0 ? "up" : "down" };
}

export default function DashboardOverview({ connections }: { connections: ConnectionRecord[] }) {
  const { state, isLoading, refresh } = useDashboard();

  const monthly = useMemo(
    () => generateMonthlyCashFlow(getTransactions(), 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state?.generatedAt],
  );

  if (!state) return null;

  const hasTransactions = state.dashboardStats.totalTransactions > 0;
  const expenseTrend = monthly.map((m) => m.expense);
  const incomeTrend = monthly.map((m) => m.income);
  let running = 0;
  const balanceTrend = monthly.map((m) => (running += m.income - m.expense));

  const expenseDelta = growthBadge(state.forecastStatistics.expenseGrowth);
  const incomeDelta = growthBadge(state.forecastStatistics.incomeGrowth);
  const newRecommendations = state.recommendations.filter((r) => r.status === "new").slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      {isLoading && <p className="text-muted-foreground text-xs">Refreshing…</p>}

      <div className="flex justify-end gap-2">
        <ImportDialog onImported={refresh} />
        <AddExpenseDialog onAdd={refresh} />
      </div>

      {!hasTransactions ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">
              No transactions yet — import a CSV or add an expense to see your overview.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              label="Balance Estimate"
              value={formatAmount(state.forecast.currentBalanceEstimate)}
              badgeText={`Net this month ${state.forecastStatistics.netCashFlow >= 0 ? "+" : ""}${formatAmount(state.forecastStatistics.netCashFlow)}`}
              badgeTone={state.forecastStatistics.netCashFlow >= 0 ? "up" : "down"}
              sparklineValues={balanceTrend}
              color="primary"
            />
            <MetricCard
              label="Projected Month-End"
              value={formatAmount(state.forecast.projectedEndOfMonthBalance)}
              badgeText={`${Math.round(state.forecast.confidence * 100)}% confidence`}
              badgeTone="neutral"
              color="ai"
            />
            <MetricCard
              label="Expected Expenses"
              value={formatAmount(state.forecast.expectedExpenses)}
              badgeText={expenseDelta.text}
              badgeTone={expenseDelta.tone === "up" ? "down" : expenseDelta.tone === "down" ? "up" : "neutral"}
              sparklineValues={expenseTrend}
              color="warning"
            />
            <MetricCard
              label="Expected Income"
              value={formatAmount(state.forecast.expectedIncome)}
              badgeText={incomeDelta.text}
              badgeTone={incomeDelta.tone}
              sparklineValues={incomeTrend}
              color="success"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.65fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cash Flow</CardTitle>
                <p className="text-muted-foreground text-xs">Income vs. spending · trailing 6 months</p>
              </CardHeader>
              <CardContent>
                <CashFlowChart data={monthly} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Upcoming Bills</CardTitle>
              </CardHeader>
              <CardContent>
                <UpcomingBills items={state.recurring} />
              </CardContent>
            </Card>
          </div>

          {newRecommendations.length > 0 && (
            <Card className="from-ai/10 to-card border-ai/30 bg-gradient-to-br">
              <CardHeader>
                <CardTitle className="text-base">AI Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {newRecommendations.map((rec) => (
                    <RecommendationCard key={rec.id} recommendation={rec} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <RecentActivity timeline={state.timeline} />
              </CardContent>
            </Card>
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Budgets</CardTitle>
                </CardHeader>
                <CardContent>
                  <BudgetsMini statuses={state.budgets} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Connections</CardTitle>
                </CardHeader>
                <CardContent>
                  <ConnectionsMini connections={connections} />
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
