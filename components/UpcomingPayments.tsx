import { Card, CardContent } from "@/components/ui/card";
import type { RecurringTransaction } from "@/types/recurring";

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function sortByDaysRemaining(items: RecurringTransaction[]): RecurringTransaction[] {
  return [...items].sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity));
}

function Row({ item }: { item: RecurringTransaction }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex flex-col">
        <span>{item.title}</span>
        <span className="text-muted-foreground text-xs">
          {formatDate(item.nextExpectedOccurrence)}
          {item.daysRemaining !== null &&
            ` · ${item.daysRemaining === 0 ? "Today" : `in ${item.daysRemaining}d`}`}
        </span>
      </div>
      <span className="font-medium">{formatAmount(item.averageAmount)}</span>
    </div>
  );
}

/** Focused view of everything due soon — the same "Upcoming" items shown
 * in RecurringList, just split by direction and sorted by urgency. */
export default function UpcomingPayments({ items }: { items: RecurringTransaction[] }) {
  const upcoming = items.filter((r) => r.status === "Upcoming");
  const upcomingExpenses = sortByDaysRemaining(upcoming.filter((r) => r.isExpense));
  const upcomingIncome = sortByDaysRemaining(upcoming.filter((r) => r.isIncome));

  if (upcoming.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">Nothing due in the next 7 days.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {upcomingExpenses.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs font-medium">
              Upcoming Payments
            </span>
            {upcomingExpenses.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </CardContent>
        </Card>
      )}
      {upcomingIncome.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs font-medium">
              Upcoming Income
            </span>
            {upcomingIncome.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
