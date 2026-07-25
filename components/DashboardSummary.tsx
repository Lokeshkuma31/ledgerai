import { Card, CardContent } from "@/components/ui/card";
import type { DashboardStats } from "@/types/financial-state";

export default function DashboardSummary({
  stats,
}: {
  stats: DashboardStats;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Transactions</span>
          <span className="text-lg font-semibold">
            {stats.totalTransactions}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Reviewed</span>
          <span className="text-lg font-semibold">{stats.reviewedCount}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Pending Review</span>
          <span className="text-lg font-semibold">
            {stats.pendingReviewCount}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
