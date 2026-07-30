import type { RecurringTransaction } from "@/types/recurring";

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatDay(dateStr: string): { mon: string; day: string } {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return {
    mon: date.toLocaleDateString("en-US", { month: "short" }),
    day: String(date.getDate()).padStart(2, "0"),
  };
}

export default function UpcomingBills({ items }: { items: RecurringTransaction[] }) {
  const upcoming = items
    .filter((r) => r.isExpense && r.nextExpectedOccurrence && r.status !== "Stopped" && r.status !== "Paused")
    .sort((a, b) => a.nextExpectedOccurrence!.localeCompare(b.nextExpectedOccurrence!))
    .slice(0, 4);

  if (upcoming.length === 0) {
    return <p className="text-muted-foreground text-sm">No upcoming bills detected.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {upcoming.map((item) => {
        const { mon, day } = formatDay(item.nextExpectedOccurrence!);
        return (
          <div key={item.id} className="bg-surface-2 flex items-center gap-3 rounded-xl p-2.5">
            <div className="border-border bg-background flex size-[38px] shrink-0 flex-col items-center justify-center rounded-[10px] border">
              <span className="text-muted-foreground text-[9px] leading-none uppercase">{mon}</span>
              <span className="font-numeric text-sm leading-tight font-semibold">{day}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{item.title}</div>
              <div className="text-muted-foreground text-xs">{item.category}</div>
            </div>
            <div className="font-numeric text-sm font-semibold">{formatAmount(item.averageAmount)}</div>
          </div>
        );
      })}
    </div>
  );
}
