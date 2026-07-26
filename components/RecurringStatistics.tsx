import { Card, CardContent } from "@/components/ui/card";
import type { RecurringStatistics as RecurringStatisticsType } from "@/types/recurring";

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

export default function RecurringStatistics({
  stats,
}: {
  stats: RecurringStatisticsType;
}) {
  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Active Subscriptions" value={String(stats.totalActiveSubscriptions)} />
        <Stat label="Monthly Subscription Cost" value={formatAmount(stats.monthlySubscriptionCost)} />
        <Stat label="Yearly Subscription Cost" value={formatAmount(stats.yearlySubscriptionCost)} />
        <Stat
          label="Upcoming Payments"
          value={`${stats.upcomingPaymentsCount} (${formatAmount(stats.upcomingPaymentsTotal)})`}
        />
        <Stat
          label="Upcoming Income"
          value={`${stats.upcomingIncomeCount} (${formatAmount(stats.upcomingIncomeTotal)})`}
        />
        <Stat label="Recurring Expense Ratio" value={formatRatio(stats.recurringExpenseRatio)} />
        <Stat label="Recurring Income Ratio" value={formatRatio(stats.recurringIncomeRatio)} />
      </CardContent>
    </Card>
  );
}
