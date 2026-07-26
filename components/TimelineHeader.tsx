import WhyButton from "@/components/WhyButton";
import { explainTimelineSummary } from "@/lib/explanations/engine";
import type { TimelineGroup } from "@/lib/timeline/engine";
import type { ExplanationContext } from "@/types/explanation";

function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default function TimelineHeader({
  label,
  totalAmount,
  transactionCount,
  group,
  explanationContext,
}: {
  label: string;
  totalAmount: number;
  transactionCount: number;
  group?: TimelineGroup;
  explanationContext?: ExplanationContext;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold tracking-tight">{label}</h3>
        {group && explanationContext && (
          <WhyButton explain={() => explainTimelineSummary(group, explanationContext)} />
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-sm font-semibold">
          {formatCurrency(totalAmount)}
        </span>
        <span className="text-muted-foreground text-xs">
          {transactionCount}{" "}
          {transactionCount === 1 ? "Transaction" : "Transactions"}
        </span>
      </div>
    </div>
  );
}
