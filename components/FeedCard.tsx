import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import PriorityBadge from "@/components/PriorityBadge";
import SeverityBadge from "@/components/SeverityBadge";
import WhyButton from "@/components/WhyButton";
import {
  explainBudget,
  explainFinancialEvent,
  explainForecast,
  explainInsights,
  explainMerchantProfile,
  explainRecommendation,
  explainRecurringTransaction,
} from "@/lib/explanations/engine";
import type { Explanation, ExplanationContext } from "@/types/explanation";
import type { FeedItem, FeedSourceEngine } from "@/types/feed";

const SOURCE_ENGINE_LABELS: Record<FeedSourceEngine, string> = {
  budget: "Budget Engine",
  events: "Financial Events Engine",
  decision: "Decision Engine",
  recurring: "Recurring Transaction Engine",
  forecast: "Cash Flow Forecast Engine",
  merchant: "Merchant Knowledge Graph",
  timeline: "Timeline Engine",
  insights: "Insights Engine",
  feed: "Intelligence Feed Engine",
};

function formatTimestamp(iso: string, now: Date): string {
  const date = new Date(iso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((today.getTime() - itemDate.getTime()) / msPerDay);

  if (diffDays === 0) {
    return `Today, ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Resolves a FeedItem's `explanationId` (matching the Explanation Engine's
 * own `${objectType}:${objectId}` scheme) back to the underlying object in
 * `context`, then returns the right `explainX` thunk for WhyButton — the
 * same lazy-explain contract every other card in the dashboard uses. */
function buildExplain(item: FeedItem, context: ExplanationContext): (() => Explanation) | null {
  const id = item.explanationId;
  if (!id) return null;

  if (id.startsWith("budget:")) {
    const status = context.budgets.find((b) => b.id === id.slice("budget:".length));
    return status ? () => explainBudget(status, context) : null;
  }
  if (id.startsWith("forecast:")) {
    return () => explainForecast(context);
  }
  if (id.startsWith("recommendation:")) {
    const recommendation = context.recommendations.find(
      (r) => r.id === id.slice("recommendation:".length),
    );
    return recommendation ? () => explainRecommendation(recommendation, context) : null;
  }
  if (id.startsWith("recurring-transaction:")) {
    const recurringItem = context.recurring.find(
      (r) => r.id === id.slice("recurring-transaction:".length),
    );
    return recurringItem ? () => explainRecurringTransaction(recurringItem, context) : null;
  }
  if (id.startsWith("financial-event:")) {
    const event = context.events.find((e) => e.id === id.slice("financial-event:".length));
    return event ? () => explainFinancialEvent(event, context) : null;
  }
  if (id.startsWith("merchant-profile:")) {
    const profile = context.merchantProfiles.find(
      (p) => p.id === id.slice("merchant-profile:".length),
    );
    return profile ? () => explainMerchantProfile(profile, context) : null;
  }
  if (id.startsWith("insight:")) {
    return () => explainInsights(context);
  }
  return null;
}

export default function FeedCard({
  item,
  now = new Date(),
  explanationContext,
  onDismiss,
  onPin,
  onMarkRead,
}: {
  item: FeedItem;
  now?: Date;
  explanationContext?: ExplanationContext;
  onDismiss?: (item: FeedItem) => void;
  onPin?: (item: FeedItem) => void;
  onMarkRead?: (item: FeedItem) => void;
}) {
  const explain = explanationContext ? buildExplain(item, explanationContext) : null;

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium">
            {item.isPinned && <span aria-hidden="true">📌 </span>}
            {item.title}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <PriorityBadge priority={item.priority} />
            <SeverityBadge severity={item.severity} />
          </div>
        </div>
        <span className="text-muted-foreground text-xs">
          {SOURCE_ENGINE_LABELS[item.sourceEngine]} · {formatTimestamp(item.createdAt, now)}
        </span>
        <p className="text-sm">{item.summary}</p>
        <div className="flex justify-end gap-2 pt-1">
          {explain && <WhyButton explain={explain} />}
          {onMarkRead && !item.isRead && (
            <Button variant="ghost" size="xs" onClick={() => onMarkRead(item)}>
              Mark Read
            </Button>
          )}
          {onPin && (
            <Button variant="outline" size="xs" onClick={() => onPin(item)}>
              {item.isPinned ? "Unpin" : "Pin"}
            </Button>
          )}
          {onDismiss && (
            <Button variant="outline" size="xs" onClick={() => onDismiss(item)}>
              Dismiss
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
