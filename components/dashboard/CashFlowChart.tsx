"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MonthlyCashFlow } from "@/lib/timeline/monthly";

const chartConfig = {
  income: { label: "Income", color: "var(--primary)" },
  expense: { label: "Spend", color: "var(--ai)" },
} satisfies ChartConfig;

export default function CashFlowChart({ data }: { data: MonthlyCashFlow[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillIncome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.32} />
            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fillExpense" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--ai)" stopOpacity={0.22} />
            <stop offset="95%" stopColor="var(--ai)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="2 5" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontFamily="var(--font-numeric)"
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => [
                `₹${Number(value).toLocaleString("en-IN")}`,
                ` ${chartConfig[name as keyof typeof chartConfig]?.label ?? name}`,
              ]}
            />
          }
        />
        <Area
          dataKey="income"
          type="monotone"
          fill="url(#fillIncome)"
          stroke="var(--primary)"
          strokeWidth={2.5}
        />
        <Area
          dataKey="expense"
          type="monotone"
          fill="url(#fillExpense)"
          stroke="var(--ai)"
          strokeWidth={2.5}
        />
      </AreaChart>
    </ChartContainer>
  );
}
