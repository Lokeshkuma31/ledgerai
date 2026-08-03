"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import ChartCard from "./ChartCard";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { SyncJob } from "@/lib/sync/types";

const chartConfig = {
  completed: { label: "Completed", color: "var(--success)" },
  failed: { label: "Failed", color: "var(--destructive)" },
} satisfies ChartConfig;

type GroupBy = "day" | "provider";

function groupKey(job: SyncJob, groupBy: GroupBy): string {
  if (groupBy === "provider") return job.plugin;
  return (job.startedAt ?? job.queuedAt).slice(0, 10);
}

/**
 * Collapses "Connection Activity" and "Sync Activity" into one component
 * via a groupBy prop, sourced from lib/sync/history.ts::getAllSyncJobs() —
 * real per-job history, not a placeholder.
 */
export default function ConnectionActivityChart({ jobs }: { jobs: SyncJob[] }) {
  const reducedMotion = useReducedMotion();
  const [groupBy, setGroupBy] = useState<GroupBy>("day");

  const data = useMemo(() => {
    const totals = new Map<string, { completed: number; failed: number }>();
    for (const job of jobs) {
      const key = groupKey(job, groupBy);
      const bucket = totals.get(key) ?? { completed: 0, failed: 0 };
      if (job.status === "completed" || job.status === "partial") bucket.completed += 1;
      else if (job.status === "failed") bucket.failed += 1;
      totals.set(key, bucket);
    }
    return [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([label, v]) => ({ label, ...v }));
  }, [jobs, groupBy]);

  if (jobs.length === 0) {
    return (
      <ChartCard title="Sync & Connection Activity" description="Sync job outcomes over time.">
        <p className="text-muted-foreground py-16 text-center text-sm">No sync activity recorded yet.</p>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Sync & Connection Activity"
      description="Sync job outcomes, grouped by day or provider."
      filters={
        <div className="flex gap-1.5">
          <Button variant={groupBy === "day" ? "secondary" : "ghost"} size="sm" onClick={() => setGroupBy("day")}>
            By day
          </Button>
          <Button variant={groupBy === "provider" ? "secondary" : "ghost"} size="sm" onClick={() => setGroupBy("provider")}>
            By provider
          </Button>
        </div>
      }
      csvData={{ headers: ["Group", "Completed", "Failed"], rows: data.map((d) => [d.label, d.completed, d.failed]) }}
    >
      <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="2 5" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} width={28} fontSize={11} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="completed" stackId="a" fill="var(--success)" isAnimationActive={!reducedMotion} />
          <Bar dataKey="failed" stackId="a" fill="var(--destructive)" radius={[4, 4, 0, 0]} isAnimationActive={!reducedMotion} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
