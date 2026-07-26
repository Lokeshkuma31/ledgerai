import { Card, CardContent } from "@/components/ui/card";
import FinancialEventBadge from "@/components/FinancialEventBadge";
import type { FinancialEvent, FinancialEventType } from "@/types/event";

const TYPE_ICONS: Record<FinancialEventType, string> = {
  "large-expense": "💸",
  "recurring-expense": "🔁",
  "salary-received": "💰",
  "multiple-expenses-same-day": "🧾",
  "budget-exceeded": "⚠️",
  "budget-warning": "⚠️",
  "new-merchant": "🛒",
  "high-spending-day": "📈",
  "weekend-spending": "🏖️",
  "no-spending-day": "🌙",
  "subscription-renewing": "🔄",
  "salary-expected": "🗓️",
  "recurring-payment-missed": "⛔",
  "new-subscription-detected": "✨",
  "recurring-amount-changed": "📊",
};

function formatEventDate(dateStr: string, now: Date): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((today.getTime() - date.getTime()) / msPerDay);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function FinancialEventCard({
  event,
  now = new Date(),
}: {
  event: FinancialEvent;
  now?: Date;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <span aria-hidden="true">{TYPE_ICONS[event.type]}</span>
            {event.title}
          </span>
          <FinancialEventBadge severity={event.severity} />
        </div>
        <span className="text-muted-foreground text-xs">
          {formatEventDate(event.date, now)}
        </span>
        <p className="text-sm">{event.description}</p>
      </CardContent>
    </Card>
  );
}
