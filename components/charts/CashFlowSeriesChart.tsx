"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, Brush, CartesianGrid, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import AnnotationMarkers from "./AnnotationMarker";
import ChartCard from "./ChartCard";
import ChartLegend from "./ChartLegend";
import FinancialTooltip from "./FinancialTooltip";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { buildCashFlowSeries, resolveCashFlowMonthsBack, toNetSeries } from "@/lib/visualization/aggregator";
import { projectEventAnnotations } from "@/lib/visualization/annotations";
import { comparePeriods } from "@/lib/visualization/comparison";
import { filterTransactionsByRange, resolveComparisonWindow } from "@/lib/visualization/engine";
import { formatPercent } from "@/lib/visualization/formatter";
import type { ComparisonValue, DateWindow, TimeRangeValue } from "@/lib/visualization/types";
import type { FinancialEvent } from "@/types/event";
import type { Transaction } from "@/types/transaction";

/** Last day of "YYYY-MM" as "YYYY-MM-DD". */
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

const chartConfig = {
  income: { label: "Income", color: "var(--primary)" },
  expense: { label: "Spend", color: "var(--ai)" },
  net: { label: "Net", color: "var(--chart-3)" },
} satisfies ChartConfig;

function totalExpense(transactions: Transaction[], window: DateWindow): number {
  const monthsBack = resolveCashFlowMonthsBack(window, transactions);
  return buildCashFlowSeries(transactions, monthsBack, window.end).reduce((sum, m) => sum + m.expense, 0);
}

/**
 * One component with a series toggle, collapsing "Cash Flow Timeline,"
 * "Income vs Expense," "Net Spend Trend," and "Savings Trend" from the
 * visualization inventory — they're the same underlying MonthlyCashFlow
 * series (lib/timeline/monthly.ts::generateMonthlyCashFlow, unmodified)
 * with a different series selection, not four separate charts.
 */
export default function CashFlowSeriesChart({
  allTransactions,
  window,
  comparison,
  events,
  onRangeSelect,
  compact = false,
}: {
  /** The full transaction set — filtered internally so both the current and comparison windows can be derived from it. */
  allTransactions: Transaction[];
  window: DateWindow;
  comparison: ComparisonValue;
  /** When provided, renders dashed ReferenceLines for salary/large-expense/budget/subscription/forecast/new-merchant events that fall in this window. */
  events?: FinancialEvent[];
  /** When provided, renders a drag-to-select Brush beneath the chart that sets a custom TimeRangeValue spanning the dragged months. */
  onRangeSelect?: (range: TimeRangeValue) => void;
  compact?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const transactions = useMemo(
    () => filterTransactionsByRange(allTransactions, window),
    [allTransactions, window],
  );
  const monthsBack = resolveCashFlowMonthsBack(window, transactions);
  const series = useMemo(
    () => buildCashFlowSeries(transactions, monthsBack, window.end),
    [transactions, monthsBack, window.end],
  );
  const netSeries = useMemo(() => toNetSeries(series), [series]);
  const data = useMemo(
    () => series.map((m, i) => ({ ...m, net: netSeries[i].net })),
    [series, netSeries],
  );

  const totals = useMemo(
    () => data.reduce((acc, m) => ({ income: acc.income + m.income, expense: acc.expense + m.expense }), { income: 0, expense: 0 }),
    [data],
  );

  const spendComparison = useMemo(() => {
    const comparisonWindow = resolveComparisonWindow(window, comparison);
    if (!comparisonWindow) return null;
    const comparisonTransactions = filterTransactionsByRange(allTransactions, comparisonWindow);
    const previousExpense = totalExpense(comparisonTransactions, comparisonWindow);
    return comparePeriods(totals.expense, previousExpense);
  }, [allTransactions, window, comparison, totals.expense]);

  const annotations = useMemo(
    () => (events && !compact ? projectEventAnnotations(events, window) : []),
    [events, window, compact],
  );

  function handleBrushChange(range: { startIndex?: number; endIndex?: number }) {
    if (!onRangeSelect || range.startIndex === undefined || range.endIndex === undefined) return;
    const startMonth = data[range.startIndex]?.month;
    const endMonth = data[range.endIndex]?.month;
    if (!startMonth || !endMonth) return;
    onRangeSelect({ range: "custom", start: `${startMonth}-01`, end: lastDayOfMonth(endMonth) });
  }

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (data.length === 0 || (totals.income === 0 && totals.expense === 0)) {
    if (compact) return <p className="text-muted-foreground py-8 text-center text-sm">No transactions in this range yet.</p>;
    return (
      <ChartCard title="Cash Flow" description="Income vs. spend, and the net difference, over the selected range.">
        <p className="text-muted-foreground py-16 text-center text-sm">No transactions in this range yet.</p>
      </ChartCard>
    );
  }

  const chart = (
    <ChartContainer config={chartConfig} className={compact ? "aspect-auto h-[160px] w-full" : "aspect-auto h-[280px] w-full"}>
      <AreaChart data={data} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="analyticsFillIncome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.32} />
            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="analyticsFillExpense" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--ai)" stopOpacity={0.22} />
            <stop offset="95%" stopColor="var(--ai)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="analyticsFillNet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.28} />
            <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="2 5" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontFamily="var(--font-numeric)" />
        <ChartTooltip content={<FinancialTooltip config={chartConfig} />} />
        {!hidden.has("income") && (
          <Area
            dataKey="income"
            type="monotone"
            fill="url(#analyticsFillIncome)"
            stroke="var(--primary)"
            strokeWidth={2.5}
            isAnimationActive={!reducedMotion}
          />
        )}
        {!hidden.has("expense") && (
          <Area
            dataKey="expense"
            type="monotone"
            fill="url(#analyticsFillExpense)"
            stroke="var(--ai)"
            strokeWidth={2.5}
            isAnimationActive={!reducedMotion}
          />
        )}
        {!hidden.has("net") && (
          <Area
            dataKey="net"
            type="monotone"
            fill="url(#analyticsFillNet)"
            stroke="var(--chart-3)"
            strokeWidth={2.5}
            isAnimationActive={!reducedMotion}
          />
        )}
        {annotations.length > 0 && <AnnotationMarkers markers={annotations} data={data} />}
        {!compact && onRangeSelect && data.length > 1 && (
          <Brush dataKey="label" height={20} travellerWidth={8} stroke="var(--primary)" onChange={handleBrushChange} />
        )}
      </AreaChart>
    </ChartContainer>
  );

  if (compact) return chart;

  return (
    <ChartCard
      title="Cash Flow"
      description={
        onRangeSelect
          ? "Income vs. spend, and the net difference. Drag the strip below the chart to zoom into a custom range."
          : "Income vs. spend, and the net difference, over the selected range."
      }
      filters={
        spendComparison && (
          <Badge variant={spendComparison.trend === "up" ? "destructive" : spendComparison.trend === "down" ? "success" : "secondary"}>
            Spend {spendComparison.percentChange === null ? "n/a" : formatPercent(spendComparison.percentChange)} vs. comparison period
          </Badge>
        )
      }
      legend={<ChartLegend config={chartConfig} hidden={hidden} onToggle={toggle} />}
      csvData={{
        headers: ["Month", "Income", "Expense", "Net"],
        rows: data.map((m) => [m.label, m.income, m.expense, m.net]),
      }}
    >
      {chart}
    </ChartCard>
  );
}
