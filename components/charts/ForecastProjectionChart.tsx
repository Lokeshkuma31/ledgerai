"use client";

import { CartesianGrid, Line, LineChart, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import ChartCard from "./ChartCard";
import FinancialTooltip from "./FinancialTooltip";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { formatCurrencyINR } from "@/lib/visualization/formatter";
import type { CashFlowForecast } from "@/types/forecast";

const chartConfig = {
  balance: { label: "Balance", color: "var(--primary)" },
} satisfies ChartConfig;

/**
 * Renders CashFlowForecast (lib/forecast/engine.ts::generateForecast) as a
 * two-point line — "Today" and "Month End" are the only two real balance
 * points this engine produces; there's no persisted day-by-day forecast
 * series to draw a richer curve from, so this deliberately doesn't
 * fabricate intermediate points.
 */
export default function ForecastProjectionChart({
  forecast,
  compact = false,
}: {
  forecast: CashFlowForecast;
  compact?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const data = [
    { label: "Today", balance: forecast.currentBalanceEstimate },
    { label: "Month End", balance: forecast.projectedEndOfMonthBalance },
  ];

  const chart = (
    <ChartContainer config={chartConfig} className={compact ? "aspect-auto h-[140px] w-full" : "aspect-auto h-[220px] w-full"}>
      <LineChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="2 5" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontFamily="var(--font-numeric)" />
        <ChartTooltip content={<FinancialTooltip config={chartConfig} />} />
        <Line
          dataKey="balance"
          type="linear"
          stroke="var(--primary)"
          strokeWidth={2.5}
          dot={{ r: 4 }}
          isAnimationActive={!reducedMotion}
        />
      </LineChart>
    </ChartContainer>
  );

  if (compact) return chart;

  return (
    <ChartCard
      title="Forecast Projection"
      description={`Daily safe spend ${formatCurrencyINR(forecast.dailySafeSpend)} · ${forecast.daysRemaining} days left this month.`}
      filters={<ConfidenceBadge confidence={forecast.confidence} />}
      csvData={{ headers: ["Point", "Balance"], rows: data.map((d) => [d.label, d.balance]) }}
    >
      {chart}
    </ChartCard>
  );
}
