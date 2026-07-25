import { Card, CardContent } from "@/components/ui/card";
import type { CategoryBreakdownEntry } from "@/lib/insights/engine";

export default function CategoryBreakdown({
  breakdown,
}: {
  breakdown: CategoryBreakdownEntry[];
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {breakdown.map((entry) => (
          <div
            key={entry.category}
            className="flex items-center justify-between text-sm"
          >
            <span>{entry.category}</span>
            <span className="text-muted-foreground">
              ₹{Math.round(entry.total).toLocaleString("en-IN")} (
              {Math.round(entry.percentage)}%)
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
