"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import ChartCard from "./ChartCard";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { formatCurrencyINR } from "@/lib/visualization/formatter";
import type { MerchantSpendSummary } from "@/types/merchant-profile";

const chartConfig = {
  totalSpend: { label: "Spent", color: "var(--primary)" },
} satisfies ChartConfig;

/**
 * Ranks merchants by total spend (lib/merchant/knowledge-statistics.ts::
 * getMerchantKnowledgeStatistics().topMerchantsBySpend) — the "Top
 * Merchants" half of the inventory's "TopEntitiesChart" collapse; "Top
 * Categories" is already covered by CategoryBreakdownChart's ranked list,
 * so this component only needs the merchant entity type.
 */
export default function TopEntitiesChart({
  merchants,
  compact = false,
}: {
  merchants: MerchantSpendSummary[];
  compact?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const data = compact ? merchants.slice(0, 3) : merchants;

  if (data.length === 0) {
    const empty = <p className="text-muted-foreground py-8 text-center text-sm">No merchant data yet.</p>;
    return compact ? (
      empty
    ) : (
      <ChartCard title="Top Merchants" description="Highest total spend by merchant.">
        {empty}
      </ChartCard>
    );
  }

  const chart = (
    <ChartContainer config={chartConfig} className={compact ? "aspect-auto h-[140px] w-full" : "aspect-auto h-[240px] w-full"}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="2 5" />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="canonicalName" tickLine={false} axisLine={false} width={110} fontSize={12} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={<ChartTooltipContent formatter={(v) => formatCurrencyINR(Number(v))} hideLabel />}
        />
        <Bar dataKey="totalSpend" fill="var(--primary)" radius={[0, 6, 6, 0]} isAnimationActive={!reducedMotion} />
      </BarChart>
    </ChartContainer>
  );

  if (compact) return chart;

  return (
    <ChartCard
      title="Top Merchants"
      description="Highest total spend by merchant."
      csvData={{
        headers: ["Merchant", "Total Spend", "Transactions", "Average Transaction"],
        rows: merchants.map((m) => [m.canonicalName, m.totalSpend, m.transactionCount, Math.round(m.averageTransactionAmount)]),
      }}
    >
      {chart}
    </ChartCard>
  );
}
