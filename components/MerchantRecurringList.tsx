import { Badge } from "@/components/ui/badge";
import type { RecurringStatus, RecurringTransaction } from "@/types/recurring";

const STATUS_VARIANT: Record<RecurringStatus, "success" | "info" | "destructive" | "warning" | "secondary"> = {
  Active: "success",
  Upcoming: "info",
  Missed: "destructive",
  Paused: "warning",
  Stopped: "secondary",
};

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/** Filters the already-detected recurring set (lib/recurring/engine.ts) down
 * to one merchant — no new detection logic, purely a filtered render. */
export default function MerchantRecurringList({ items }: { items: RecurringTransaction[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">No recurring payments detected for this merchant.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((r) => (
        <div key={r.id} className="border-border flex items-center justify-between gap-3 border-t py-2.5 first:border-t-0">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{r.title}</span>
            <span className="text-muted-foreground text-xs">
              {r.frequency}
              {r.nextExpectedOccurrence ? ` · next ${r.nextExpectedOccurrence}` : ""}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-numeric text-sm font-semibold">{formatAmount(r.averageAmount)}</span>
            <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
