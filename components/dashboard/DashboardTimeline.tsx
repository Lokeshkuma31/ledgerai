import type { TimelineGroup } from "@/lib/timeline/engine";

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/**
 * The dashboard's closing, contextual/historical note — renders the
 * already-computed timeline (lib/timeline/engine.ts, present on
 * FinancialState but never surfaced on the dashboard before this) as a
 * condensed strip of activity buckets.
 */
export default function DashboardTimeline({ timeline }: { timeline: TimelineGroup[] }) {
  const groups = timeline.filter((g) => g.transactionCount > 0);

  if (groups.length === 0) {
    return <p className="text-muted-foreground text-sm">Nothing recorded yet.</p>;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {groups.map((g) => (
        <div key={g.key} className="border-border bg-surface-2/50 min-w-[140px] flex-1 rounded-xl border px-3 py-2.5">
          <div className="text-muted-foreground text-xs font-medium">{g.label}</div>
          <div className="font-numeric mt-1 text-sm font-semibold">{formatAmount(g.totalAmount)}</div>
          <div className="text-muted-foreground text-xs">
            {g.transactionCount} transaction{g.transactionCount === 1 ? "" : "s"}
          </div>
        </div>
      ))}
    </div>
  );
}
