import type { TimelineGroup } from "@/lib/timeline/engine";

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function RecentActivity({ timeline }: { timeline: TimelineGroup[] }) {
  const recent = timeline.flatMap((g) => g.transactions).slice(0, 5);

  if (recent.length === 0) {
    return <p className="text-muted-foreground text-sm">No transactions yet.</p>;
  }

  return (
    <div className="flex flex-col">
      {recent.map((t) => {
        const category = t.userCategory ?? t.aiCategory ?? "Other";
        const name = t.merchantName ?? t.note ?? "Transaction";
        return (
          <div key={t.id} className="border-border flex items-center gap-3 border-t py-2.5 first:border-t-0">
            <div className="bg-surface-2 text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-[10px] text-xs font-semibold">
              {initials(name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{name}</div>
              <div className="text-muted-foreground text-xs">
                {category} · {formatDate(t.date)}
              </div>
            </div>
            <div className="font-numeric text-sm font-semibold">
              ₹{Math.round(t.amount).toLocaleString("en-IN")}
            </div>
          </div>
        );
      })}
    </div>
  );
}
