"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { CategoryBreakdownEntry } from "@/lib/insights/engine";

const chartConfig = {
  total: { label: "Spent", color: "var(--primary)" },
} satisfies ChartConfig;

export default function CategoryBarChart({ breakdown }: { breakdown: CategoryBreakdownEntry[] }) {
  const data = [...breakdown].sort((a, b) => b.total - a.total).slice(0, 8);

  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">No category data yet.</p>;
  }

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="2 5" />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="category"
          tickLine={false}
          axisLine={false}
          width={90}
          fontSize={12}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={<ChartTooltipContent formatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`} hideLabel />}
        />
        <Bar dataKey="total" fill="var(--primary)" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
