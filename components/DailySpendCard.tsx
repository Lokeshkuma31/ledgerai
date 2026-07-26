import { Card, CardContent } from "@/components/ui/card";
import type { CashFlowForecast } from "@/types/forecast";

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default function DailySpendCard({ forecast }: { forecast: CashFlowForecast }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between">
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Days Remaining</span>
            <span className="font-medium">{forecast.daysRemaining}</span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-2xl font-semibold tracking-tight">
            {formatAmount(forecast.dailySafeSpend)}
            <span className="text-muted-foreground text-sm font-normal">/day</span>
          </span>
          <span className="text-muted-foreground text-xs">Safe Daily Spend</span>
        </div>
      </CardContent>
    </Card>
  );
}
