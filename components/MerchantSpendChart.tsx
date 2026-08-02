"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { MonthlyCashFlow } from "@/lib/timeline/monthly";

const chartConfig = {
  expense: { label: "Spend", color: "var(--ai)" },
} satisfies ChartConfig;

/** Same Recharts area-chart idiom as the Dashboard's CashFlowChart, applied
 * to one merchant's trailing spend instead of the whole account's income
 * vs. expense — reuses the pattern rather than inventing a new chart look. */
export default function MerchantSpendChart({ data }: { data: MonthlyCashFlow[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillMerchantSpend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--ai)" stopOpacity={0.28} />
            <stop offset="95%" stopColor="var(--ai)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="2 5" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontFamily="var(--font-numeric)" />
        <ChartTooltip
          content={
            <ChartTooltipContent formatter={(value) => [`₹${Number(value).toLocaleString("en-IN")}`, " Spend"]} />
          }
        />
        <Area dataKey="expense" type="monotone" fill="url(#fillMerchantSpend)" stroke="var(--ai)" strokeWidth={2.5} />
      </AreaChart>
    </ChartContainer>
  );
}
