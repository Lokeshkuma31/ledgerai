import TimelineHeader from "@/components/TimelineHeader";
import TimelineTransactionList from "@/components/TimelineTransactionList";
import type { TimelineGroup } from "@/lib/timeline/engine";
import type { ExplanationContext } from "@/types/explanation";
import type { Category } from "@/types/transaction";

export default function TimelineSection({
  group,
  onReview,
  explanationContext,
}: {
  group: TimelineGroup;
  onReview: (id: string, userCategory?: Category) => void;
  explanationContext?: ExplanationContext;
}) {
  return (
    <section className="flex flex-col gap-3">
      <TimelineHeader
        label={group.label}
        totalAmount={group.totalAmount}
        transactionCount={group.transactionCount}
        group={group}
        explanationContext={explanationContext}
      />
      <hr className="border-border" />
      <TimelineTransactionList
        transactions={group.transactions}
        onReview={onReview}
      />
    </section>
  );
}
