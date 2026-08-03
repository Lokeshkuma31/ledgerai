"use client";

import { useMemo } from "react";
import ChartCard from "./ChartCard";
import { formatCurrencyINR } from "@/lib/visualization/formatter";
import type { HeatmapCell } from "@/lib/visualization/aggregator";

function intensity(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(1, value / max);
}

/**
 * One generic heatmap grid — cells colored/sized by an aggregated value —
 * parameterized by whichever bucketing function (bucketByDay,
 * bucketByDayOfWeek, bucketByCategory, ...) produced its `cells`. Collapses
 * the brief's "6 heatmap variants" (spending heatmap, daily/weekly/monthly
 * patterns, category/merchant heatmaps) into one render instead of six
 * bespoke SVG-grid components that would all do the same thing.
 */
export default function CalendarHeatmap({
  title,
  description,
  cells,
  metric = "amount",
  compact = false,
}: {
  title: string;
  description?: string;
  cells: HeatmapCell[];
  metric?: "amount" | "count";
  compact?: boolean;
}) {
  const max = useMemo(
    () => Math.max(0, ...cells.map((c) => (metric === "amount" ? c.total : c.count))),
    [cells, metric],
  );

  const grid = (
    <div className="flex flex-wrap gap-1.5">
      {cells.map((cell) => {
        const value = metric === "amount" ? cell.total : cell.count;
        const alpha = value === 0 ? 6 : Math.round((0.12 + intensity(value, max) * 0.78) * 100);
        return (
          <div
            key={cell.key}
            title={`${cell.label}: ${metric === "amount" ? formatCurrencyINR(cell.total) : `${cell.count} transactions`}`}
            className="flex h-10 min-w-10 flex-1 basis-10 items-center justify-center rounded-md text-[10px] font-medium"
            style={{ backgroundColor: `color-mix(in oklch, var(--primary) ${alpha}%, transparent)` }}
          >
            <span className="text-foreground/80">{cell.label}</span>
          </div>
        );
      })}
    </div>
  );

  if (compact) return grid;

  return (
    <ChartCard
      title={title}
      description={description}
      csvData={{ headers: ["Label", "Total", "Count"], rows: cells.map((c) => [c.label, c.total, c.count]) }}
    >
      {grid}
    </ChartCard>
  );
}
