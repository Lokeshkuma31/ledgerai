import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import WhyButton from "@/components/WhyButton";
import { explainRecurringTransaction } from "@/lib/explanations/engine";
import type { ExplanationContext } from "@/types/explanation";
import type { RecurringStatus, RecurringTransaction } from "@/types/recurring";

const STATUS_VARIANT: Record<RecurringStatus, "secondary" | "info" | "destructive" | "warning"> = {
  Active: "secondary",
  Upcoming: "info",
  Missed: "destructive",
  Paused: "warning",
  Stopped: "secondary",
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
    <Card size="sm" className="hover:ring-primary/30 transition-shadow hover:shadow-md">
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className={`text-sm font-semibold ${item.status === "Stopped" ? "line-through" : ""}`}>
              {item.title}
            </span>
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
            <Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>
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
