import { Card, CardContent } from "@/components/ui/card";
import WhyButton from "@/components/WhyButton";
import { explainInsights } from "@/lib/explanations/engine";
import type { Insights } from "@/lib/insights/engine";
import type { ExplanationContext } from "@/types/explanation";

function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default function InsightsSummary({
  insights,
  explanationContext,
}: {
  insights: Insights;
  explanationContext: ExplanationContext;
}) {
  const stats = [
    { label: "Total Spent", value: formatCurrency(insights.totalSpent) },
    { label: "Total Transactions", value: String(insights.totalTransactions) },
    {
      label: "Average Expense",
      value: formatCurrency(insights.averageExpense),
    },
    {
      label: "Largest Expense",
      value: formatCurrency(insights.largestExpense),
    },
    { label: "Most Used Category", value: insights.topCategory ?? "—" },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">{stat.label}</span>
              <span className="text-lg font-semibold">{stat.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex justify-end">
        <WhyButton explain={() => explainInsights(explanationContext)} />
      </div>
    </div>
  );
}
