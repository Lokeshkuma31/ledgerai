import { Card, CardContent } from "@/components/ui/card";
import WhyButton from "@/components/WhyButton";
import { explainRecurringTransaction } from "@/lib/explanations/engine";
import type { ExplanationContext } from "@/types/explanation";
import type { RecurringStatus, RecurringTransaction } from "@/types/recurring";

const STATUS_STYLES: Record<RecurringStatus, string> = {
  Active: "bg-muted text-muted-foreground",
  Upcoming: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  Missed: "bg-destructive/10 text-destructive",
  Paused: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Stopped: "bg-muted text-muted-foreground line-through",
};

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export default function RecurringCard({
  item,
  explanationContext,
}: {
  item: RecurringTransaction;
  explanationContext?: ExplanationContext;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{item.title}</span>
            <span className="text-muted-foreground text-xs">
              {item.frequency}
              {item.isSubscription ? " · Subscription" : item.isIncome ? " · Income" : ""}
            </span>
          </div>
          <span className="text-sm font-semibold">{formatAmount(item.averageAmount)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">
            {item.isIncome ? "Next expected" : "Next due"}: {formatDate(item.nextExpectedOccurrence)}
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[item.status]}`}
            >
              {item.status}
            </span>
            <span className="text-muted-foreground text-xs">
              {Math.round(item.confidence * 100)}%
            </span>
          </div>
        </div>
        {explanationContext && (
          <div className="flex justify-end">
            <WhyButton explain={() => explainRecurringTransaction(item, explanationContext)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
