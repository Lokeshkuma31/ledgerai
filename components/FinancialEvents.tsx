import { Card, CardContent } from "@/components/ui/card";
import FinancialEventCard from "@/components/FinancialEventCard";
import type { FinancialEvent } from "@/types/event";

export default function FinancialEvents({
  events,
}: {
  events: FinancialEvent[];
}) {
  if (events.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">No financial events yet.</p>
        </CardContent>
      </Card>
    );
  }

  const now = new Date();

  return (
    <div className="flex flex-col gap-3">
      {events.map((event) => (
        <FinancialEventCard key={event.id} event={event} now={now} />
      ))}
    </div>
  );
}
