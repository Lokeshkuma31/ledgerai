"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ChartCard from "./ChartCard";
import { formatCurrencyINR } from "@/lib/visualization/formatter";
import type { RecurringStatus, RecurringTransaction } from "@/types/recurring";

const STATUS_VARIANT: Record<RecurringStatus, "success" | "info" | "destructive" | "warning" | "secondary"> = {
  Active: "success",
  Upcoming: "info",
  Missed: "destructive",
  Paused: "warning",
  Stopped: "secondary",
};

type View = "all" | "subscriptions";

/**
 * Renders RecurringTransaction[] (lib/recurring/engine.ts) sorted into a
 * timeline by next expected occurrence — collapses "Recurring Payments
 * Timeline" and "Subscription Calendar" into one component via a view
 * filter rather than building a literal calendar grid for the same data.
 */
export default function RecurringTimelineChart({
  recurring,
  compact = false,
}: {
  recurring: RecurringTransaction[];
  compact?: boolean;
}) {
  const [view, setView] = useState<View>("all");

  const items = useMemo(() => {
    const filtered = view === "subscriptions" ? recurring.filter((r) => r.isSubscription) : recurring;
    return [...filtered].sort((a, b) => {
      if (!a.nextExpectedOccurrence) return 1;
      if (!b.nextExpectedOccurrence) return -1;
      return a.nextExpectedOccurrence.localeCompare(b.nextExpectedOccurrence);
    });
  }, [recurring, view]);

  const rows = compact ? items.slice(0, 4) : items;

  const list = (
    <div className="flex flex-col gap-2">
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">Nothing recurring detected here yet.</p>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="border-border flex items-center justify-between gap-3 border-t py-2.5 first:border-t-0">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{r.title}</span>
              <span className="text-muted-foreground text-xs">
                {r.frequency}
                {r.nextExpectedOccurrence ? ` · next ${r.nextExpectedOccurrence}` : ""}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-numeric text-sm font-semibold">{formatCurrencyINR(r.averageAmount)}</span>
              <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
            </div>
          </div>
        ))
      )}
    </div>
  );

  if (compact) return list;

  return (
    <ChartCard
      title="Recurring Payments"
      description="Detected recurring transactions, ordered by next expected occurrence."
      filters={
        <div className="flex gap-1.5">
          <Button variant={view === "all" ? "secondary" : "ghost"} size="sm" onClick={() => setView("all")}>
            All
          </Button>
          <Button variant={view === "subscriptions" ? "secondary" : "ghost"} size="sm" onClick={() => setView("subscriptions")}>
            Subscriptions
          </Button>
        </div>
      }
      csvData={{
        headers: ["Title", "Category", "Frequency", "Average Amount", "Next Occurrence", "Status"],
        rows: items.map((r) => [r.title, r.category, r.frequency, r.averageAmount, r.nextExpectedOccurrence ?? "n/a", r.status]),
      }}
    >
      {list}
    </ChartCard>
  );
}
