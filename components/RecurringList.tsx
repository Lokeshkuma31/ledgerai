import { Card, CardContent } from "@/components/ui/card";
import RecurringCard from "@/components/RecurringCard";
import type { ExplanationContext } from "@/types/explanation";
import type { RecurringTransaction } from "@/types/recurring";

export default function RecurringList({
  items,
  explanationContext,
}: {
  items: RecurringTransaction[];
  explanationContext?: ExplanationContext;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">
            No recurring transactions detected yet. Once a merchant or bill
            appears at least 3 times with a similar amount, it shows up here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {items.map((item) => (
        <RecurringCard key={item.id} item={item} explanationContext={explanationContext} />
      ))}
    </div>
  );
}
