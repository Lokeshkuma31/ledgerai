"use client";

import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { BudgetStatus } from "@/types/budget";

const PALETTE = [
  "var(--primary)",
  "var(--ai)",
  "var(--success)",
  "var(--warning)",
  "var(--chart-5)",
  "var(--destructive)",
];

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default function BudgetDonut({ statuses }: { statuses: BudgetStatus[] }) {
  const sorted = [...statuses].sort((a, b) => b.currentSpend - a.currentSpend);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  const restTotal = rest.reduce((sum, s) => sum + s.currentSpend, 0);

  const slices = [
    ...top.map((s) => ({ name: s.category, value: s.currentSpend })),
    ...(restTotal > 0 ? [{ name: "Other", value: restTotal }] : []),
  ].filter((s) => s.value > 0);

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  const chartConfig = Object.fromEntries(
    slices.map((s, i) => [s.name, { label: s.name, color: PALETTE[i % PALETTE.length] }]),
  ) satisfies ChartConfig;

  if (total === 0) {
    return <p className="text-muted-foreground text-sm">No spend recorded against a budget yet this month.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[220px]">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`} />} />
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius={70} outerRadius={95} strokeWidth={2}>
              {slices.map((s, i) => (
                <Cell key={s.name} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-muted-foreground text-xs">Total spent</span>
          <span className="font-numeric text-xl font-semibold">{formatAmount(total)}</span>
        </div>
      </div>
      <div className="flex w-full flex-col gap-2">
        {slices.map((s, i) => (
          <div key={s.name} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
            <span className="text-muted-foreground">{s.name}</span>
            <span className="font-numeric ml-auto">{formatAmount(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
