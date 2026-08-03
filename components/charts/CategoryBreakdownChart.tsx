"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import ChartCard from "./ChartCard";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { bucketByCategory, effectiveCategory } from "@/lib/visualization/aggregator";
import { comparePeriods } from "@/lib/visualization/comparison";
import { filterTransactionsByRange, resolveComparisonWindow } from "@/lib/visualization/engine";
import { formatCurrencyINR, formatPercent } from "@/lib/visualization/formatter";
import type { ComparisonValue, DateWindow } from "@/lib/visualization/types";
import type { Transaction } from "@/types/transaction";

const chartConfig = {
  total: { label: "Spent", color: "var(--primary)" },
} satisfies ChartConfig;

/**
 * Category spending, sourced from lib/visualization/aggregator.ts's
 * bucketByCategory (the same sum-and-sort as Insights.categoryBreakdown,
 * applied to a time-range-filtered slice) — collapses "Category Spending"
 * and "Top Categories" from the inventory into one ranked list.
 */
export default function CategoryBreakdownChart({
  allTransactions,
  window,
  comparison,
  compact = false,
}: {
  allTransactions: Transaction[];
  window: DateWindow;
  comparison: ComparisonValue;
  compact?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState<string | null>(null);

  const transactions = useMemo(
    () => filterTransactionsByRange(allTransactions, window),
    [allTransactions, window],
  );
  const breakdown = useMemo(() => bucketByCategory(transactions), [transactions]);

  const previousBreakdown = useMemo(() => {
    const comparisonWindow = resolveComparisonWindow(window, comparison);
    if (!comparisonWindow) return null;
    return bucketByCategory(filterTransactionsByRange(allTransactions, comparisonWindow));
  }, [allTransactions, window, comparison]);

  const rows = useMemo(() => {
    const top = breakdown.slice(0, compact ? 5 : 8);
    return top.map((entry) => {
      const previous = previousBreakdown?.find((p) => p.category === entry.category)?.total ?? 0;
      const delta = previousBreakdown ? comparePeriods(entry.total, previous) : null;
      return { ...entry, delta };
    });
  }, [breakdown, previousBreakdown, compact]);

  if (rows.length === 0) {
    if (compact) return <p className="text-muted-foreground py-8 text-center text-sm">No category data in this range yet.</p>;
    return (
      <ChartCard title="Categories" description="Where spend went in the selected range.">
        <p className="text-muted-foreground py-16 text-center text-sm">No category data in this range yet.</p>
      </ChartCard>
    );
  }

  const chart = (
    <ChartContainer config={chartConfig} className={compact ? "aspect-auto h-[160px] w-full" : "aspect-auto h-[240px] w-full"}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="2 5" />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="category" tickLine={false} axisLine={false} width={90} fontSize={12} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={<ChartTooltipContent formatter={(v) => formatCurrencyINR(Number(v))} hideLabel />}
        />
        <Bar dataKey="total" fill="var(--primary)" radius={[0, 6, 6, 0]} isAnimationActive={!reducedMotion} />
      </BarChart>
    </ChartContainer>
  );

  if (compact) return chart;

  function toggleExpanded(category: string) {
    setExpanded((prev) => (prev === category ? null : category));
  }

  return (
    <ChartCard
      title="Categories"
      description="Where spend went in the selected range. Click a category to see its transactions."
      csvData={{
        headers: ["Category", "Total", "Percentage", "Change vs. comparison"],
        rows: rows.map((r) => [
          r.category,
          r.total,
          r.percentage.toFixed(1),
          r.delta?.percentChange !== undefined && r.delta?.percentChange !== null
            ? r.delta.percentChange.toFixed(1)
            : "n/a",
        ]),
      }}
    >
      {chart}
      <div className="flex flex-col gap-1.5 pt-2">
        {rows.map((r) => {
          const isExpanded = expanded === r.category;
          const matching = isExpanded ? transactions.filter((t) => effectiveCategory(t) === r.category) : [];
          return (
            <div key={r.category} className="flex flex-col">
              <button
                type="button"
                onClick={() => toggleExpanded(r.category)}
                aria-expanded={isExpanded}
                className="hover:bg-muted flex items-center justify-between rounded-md px-1.5 py-1 text-sm transition-colors"
              >
                <span>{r.category}</span>
                <span className="flex items-center gap-2">
                  <span className="font-numeric text-muted-foreground">{formatCurrencyINR(r.total)}</span>
                  {r.delta && (
                    <Badge variant={r.delta.trend === "up" ? "destructive" : r.delta.trend === "down" ? "success" : "secondary"}>
                      {r.delta.percentChange === null ? "n/a" : formatPercent(r.delta.percentChange)}
                    </Badge>
                  )}
                </span>
              </button>
              {isExpanded && (
                <div className="border-border ml-1.5 flex flex-col gap-1 border-l pl-3 py-1">
                  {matching.length === 0 ? (
                    <p className="text-muted-foreground py-1 text-xs">No transactions found.</p>
                  ) : (
                    matching.slice(0, 10).map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate">{t.merchantName ?? (t.note || "Untitled")} · {t.date}</span>
                        <span className="font-numeric shrink-0">{formatCurrencyINR(t.amount)}</span>
                      </div>
                    ))
                  )}
                  {matching.length > 10 && (
                    <p className="text-muted-foreground text-xs">+{matching.length - 10} more</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
