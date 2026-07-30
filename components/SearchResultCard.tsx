import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import WhyButton from "@/components/WhyButton";
import { explainSearchResult } from "@/lib/explanations/engine";
import type { ExplanationContext } from "@/types/explanation";
import type { IndexObjectType, SearchResultItem } from "@/types/index";

const TYPE_LABELS: Record<IndexObjectType, string> = {
  transaction: "Transaction",
  merchant: "Merchant",
  "merchant-profile": "Merchant Profile",
  category: "Category",
  "timeline-entry": "Timeline",
  budget: "Budget",
  "financial-event": "Event",
  recommendation: "Recommendation",
  "recurring-transaction": "Recurring",
  "forecast-summary": "Forecast",
  conversation: "Past Question",
  explanation: "Explanation",
  workflow: "Workflow Run",
  "bank-account": "Bank Account",
  "bank-institution": "Bank Institution",
  "bank-sync-run": "Bank Sync",
  consent: "Consent",
  document: "Document",
  email: "Email",
  connection: "Connection",
  "sync-job": "Sync Job",
};

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default function SearchResultCard({
  item,
  explanationContext,
}: {
  item: SearchResultItem;
  explanationContext?: ExplanationContext;
}) {
  const { object } = item;
  return (
    <Card size="sm" className="hover:ring-primary/30 transition-shadow hover:shadow-md">
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary">{TYPE_LABELS[object.type]}</Badge>
              {object.date && <span className="text-muted-foreground text-xs">{object.date}</span>}
            </div>
            <span className="text-sm font-semibold">{object.title}</span>
          </div>
          {object.amount !== undefined && (
            <span className="text-sm font-semibold">{formatAmount(object.amount)}</span>
          )}
        </div>
        <p className="text-muted-foreground text-sm">{object.description}</p>
        {object.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {object.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        {explanationContext && object.type !== "explanation" && (
          <div className="flex justify-end">
            <WhyButton explain={() => explainSearchResult(object, explanationContext)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
