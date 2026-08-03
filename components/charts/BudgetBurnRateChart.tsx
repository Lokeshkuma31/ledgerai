"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import ChartCard from "./ChartCard";
import ChartLegend from "./ChartLegend";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { buildBudgetBurnRateSeries } from "@/lib/visualization/aggregator";
import type { Budget } from "@/types/budget";
import type { Transaction } from "@/types/transaction";

const LINE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/**
 * Trailing burn-rate trend per budget category — built from
 * lib/visualization/aggregator.ts::buildBudgetBurnRateSeries, which itself
 * only calls the existing calculateBudgetStatus engine per historical
 * month. No new budget math.
 */
export default function BudgetBurnRateChart({
  budgets,
  transactions,
  monthsBack = 6,
  now,
}: {
  budgets: Budget[];
  transactions: Transaction[];
  monthsBack?: number;
  now?: Date;
}) {
  const reducedMotion = useReducedMotion();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const data = useMemo(
    () => buildBudgetBurnRateSeries(budgets, transactions, monthsBack, now),
    [budgets, transactions, monthsBack, now],
  );

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    budgets.forEach((b, i) => {
      config[b.category] = { label: b.category, color: LINE_COLORS[i % LINE_COLORS.length] };
    });
    return config;
  }, [budgets]);

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (budgets.length === 0) {
    return (
      <ChartCard title="Budget Burn Rate" description="Percentage of each budget's limit used, trailing months.">
        <p className="text-muted-foreground py-16 text-center text-sm">No budgets configured yet.</p>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Budget Burn Rate"
      description="Percentage of each budget's limit used, trailing months. Applies each budget's current limit to past months' actual spend."
      legend={<ChartLegend config={chartConfig} hidden={hidden} onToggle={toggle} />}
      csvData={{
        headers: ["Month", ...budgets.map((b) => b.category)],
        rows: data.map((point) => [point.label, ...budgets.map((b) => point[b.category] ?? 0)]),
      }}
    >
      <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="2 5" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontFamily="var(--font-numeric)" />
          <YAxis tickLine={false} axisLine={false} width={36} fontSize={11} tickFormatter={(v) => `${v}%`} />
          <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v}%`} />} />
          {budgets.map((b, i) =>
            hidden.has(b.category) ? null : (
              <Line
                key={b.id}
                dataKey={b.category}
                type="monotone"
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={!reducedMotion}
              />
            ),
          )}
        </LineChart>
      </ChartContainer>
    </ChartCard>
  );
}
