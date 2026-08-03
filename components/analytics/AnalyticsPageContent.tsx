"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import AnimatedCounter from "@/components/shared/AnimatedCounter";
import BudgetBurnRateChart from "@/components/charts/BudgetBurnRateChart";
import BudgetProgressChart from "@/components/charts/BudgetProgressChart";
import CalendarHeatmap from "@/components/charts/CalendarHeatmap";
import CashFlowSeriesChart from "@/components/charts/CashFlowSeriesChart";
import CategoryBreakdownChart from "@/components/charts/CategoryBreakdownChart";
import ChartFilters from "@/components/charts/ChartFilters";
import ConnectionActivityChart from "@/components/charts/ConnectionActivityChart";
import EventsTimelineChart from "@/components/charts/EventsTimelineChart";
import ForecastProjectionChart from "@/components/charts/ForecastProjectionChart";
import ImportSourcesChart from "@/components/charts/ImportSourcesChart";
import RecurringTimelineChart from "@/components/charts/RecurringTimelineChart";
import TopEntitiesChart from "@/components/charts/TopEntitiesChart";
import { useDashboard } from "@/components/DashboardProvider";
import { getBudgets } from "@/lib/budget/storage";
import { isIncomeTransaction } from "@/lib/forecast/calculator";
import { getImportHistory } from "@/lib/import/history";
import { getMerchantKnowledgeStatistics } from "@/lib/merchant/knowledge-statistics";
import { getTransactions } from "@/lib/storage";
import { getAllSyncJobs } from "@/lib/sync/history";
import { bucketByDay, bucketByDayOfWeek } from "@/lib/visualization/aggregator";
import { comparePeriods } from "@/lib/visualization/comparison";
import { filterTransactionsByRange, resolveComparisonWindow, resolveTimeRange } from "@/lib/visualization/engine";
import { formatCurrencyINR, formatPercent } from "@/lib/visualization/formatter";
import { getFilterPreferences, saveFilterPreferences } from "@/lib/visualization/filterPreferences";
import { summarizeStatistics } from "@/lib/visualization/statistics";
import type { ComparisonValue, TimeRangeValue } from "@/lib/visualization/types";
import type { Budget } from "@/types/budget";
import type { ImportHistoryEntry } from "@/types/import";
import type { MerchantSpendSummary } from "@/types/merchant-profile";
import type { SyncJob } from "@/lib/sync/types";
import type { Transaction } from "@/types/transaction";

export default function AnalyticsPageContent() {
  const { state } = useDashboard();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [topMerchants, setTopMerchants] = useState<MerchantSpendSummary[]>([]);
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>([]);
  const preferences = useMemo(() => getFilterPreferences(), []);
  const [range, setRange] = useState<TimeRangeValue>({ range: preferences.range });
  const [comparison, setComparison] = useState<ComparisonValue>({ mode: preferences.comparisonMode });

  useEffect(() => {
    setTransactions(getTransactions());
    setBudgets(getBudgets());
    setTopMerchants(getMerchantKnowledgeStatistics().topMerchantsBySpend);
    setSyncJobs(getAllSyncJobs());
    setImportHistory(getImportHistory());
  }, []);

  useEffect(() => {
    saveFilterPreferences({ range: range.range, comparisonMode: comparison.mode });
  }, [range.range, comparison.mode]);

  const window = useMemo(() => resolveTimeRange(range), [range]);

  const filtered = useMemo(() => filterTransactionsByRange(transactions, window), [transactions, window]);
  const expenseAmounts = useMemo(
    () => filtered.filter((t) => !isIncomeTransaction(t)).map((t) => t.amount),
    [filtered],
  );
  const spendStats = useMemo(() => summarizeStatistics(expenseAmounts), [expenseAmounts]);

  const dayOfWeekCells = useMemo(() => bucketByDayOfWeek(filtered), [filtered]);
  const dayCells = useMemo(() => bucketByDay(filtered), [filtered]);

  const spendComparison = useMemo(() => {
    const comparisonWindow = resolveComparisonWindow(window, comparison);
    if (!comparisonWindow) return null;
    const previous = filterTransactionsByRange(transactions, comparisonWindow)
      .filter((t) => !isIncomeTransaction(t))
      .reduce((sum, t) => sum + t.amount, 0);
    return comparePeriods(spendStats.mean * spendStats.count, previous);
  }, [transactions, window, comparison, spendStats]);

  if (!state) {
    return <p className="text-muted-foreground py-16 text-center">Loading your analytics...</p>;
  }

  if (state.dashboardStats.totalTransactions === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">No transactions yet — analytics will appear once you add some.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ChartFilters range={range} onRangeChange={setRange} comparison={comparison} onComparisonChange={setComparison} />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="recurring">Recurring</TabsTrigger>
          <TabsTrigger value="merchants">Merchants</TabsTrigger>
          <TabsTrigger value="patterns">Patterns</TabsTrigger>
          <TabsTrigger value="data-sources">Data Sources</TabsTrigger>
          <TabsTrigger value="ai-insights">AI Insights</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4 pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-muted-foreground text-sm font-normal">Total Spent</CardTitle>
              </CardHeader>
              <CardContent>
                <AnimatedCounter
                  value={spendStats.mean * spendStats.count}
                  format={(v) => formatCurrencyINR(v)}
                  className="font-numeric text-2xl font-medium"
                />
                {spendComparison && (
                  <Badge
                    className="mt-2"
                    variant={spendComparison.trend === "up" ? "destructive" : spendComparison.trend === "down" ? "success" : "secondary"}
                  >
                    {spendComparison.percentChange === null ? "n/a" : formatPercent(spendComparison.percentChange)} vs. comparison
                  </Badge>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-muted-foreground text-sm font-normal">Average Transaction</CardTitle>
              </CardHeader>
              <CardContent>
                <AnimatedCounter
                  value={spendStats.mean}
                  format={(v) => formatCurrencyINR(v)}
                  className="font-numeric text-2xl font-medium"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-muted-foreground text-sm font-normal">Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <AnimatedCounter value={spendStats.count} className="font-numeric text-2xl font-medium" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cash Flow</CardTitle>
            </CardHeader>
            <CardContent>
              <CashFlowSeriesChart allTransactions={transactions} window={window} comparison={comparison} compact />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryBreakdownChart allTransactions={transactions} window={window} comparison={comparison} compact />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Budget Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <BudgetProgressChart budgets={state.budgets} compact />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Forecast</CardTitle>
              </CardHeader>
              <CardContent>
                <ForecastProjectionChart forecast={state.forecast} compact />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="cash-flow" className="pt-4">
          <CashFlowSeriesChart
            allTransactions={transactions}
            window={window}
            comparison={comparison}
            events={state.events}
            onRangeSelect={setRange}
          />
        </TabsContent>

        <TabsContent value="categories" className="pt-4">
          <CategoryBreakdownChart allTransactions={transactions} window={window} comparison={comparison} />
        </TabsContent>

        <TabsContent value="budgets" className="flex flex-col gap-4 pt-4">
          <BudgetProgressChart budgets={state.budgets} />
          <BudgetBurnRateChart budgets={budgets} transactions={transactions} />
        </TabsContent>

        <TabsContent value="forecast" className="pt-4">
          <ForecastProjectionChart forecast={state.forecast} />
        </TabsContent>

        <TabsContent value="recurring" className="pt-4">
          <RecurringTimelineChart recurring={state.recurring} />
        </TabsContent>

        <TabsContent value="merchants" className="pt-4">
          <TopEntitiesChart merchants={topMerchants} />
        </TabsContent>

        <TabsContent value="patterns" className="flex flex-col gap-4 pt-4">
          <CalendarHeatmap
            title="Weekly Spending Pattern"
            description="Total spend by day of week, in the selected range."
            cells={dayOfWeekCells}
          />
          <CalendarHeatmap
            title="Daily Spending Heatmap"
            description="Total spend per calendar day, in the selected range."
            cells={dayCells}
          />
        </TabsContent>

        <TabsContent value="data-sources" className="flex flex-col gap-4 pt-4">
          <ConnectionActivityChart jobs={syncJobs} />
          <ImportSourcesChart history={importHistory} />
        </TabsContent>

        <TabsContent value="ai-insights" className="pt-4">
          <EventsTimelineChart recommendations={state.recommendations} />
        </TabsContent>

        <TabsContent value="timeline" className="pt-4">
          <EventsTimelineChart events={state.events} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
