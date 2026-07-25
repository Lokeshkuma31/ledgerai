import { Card, CardContent } from "@/components/ui/card";
import type { Transaction } from "@/types/transaction";

export default function DashboardSummary({
  transactions,
}: {
  transactions: Transaction[];
}) {
  const total = transactions.length;
  const reviewed = transactions.filter((t) => t.reviewed).length;
  const pending = total - reviewed;

  return (
    <Card>
      <CardContent className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Transactions</span>
          <span className="text-lg font-semibold">{total}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Reviewed</span>
          <span className="text-lg font-semibold">{reviewed}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Pending Review</span>
          <span className="text-lg font-semibold">{pending}</span>
        </div>
      </CardContent>
    </Card>
  );
}
