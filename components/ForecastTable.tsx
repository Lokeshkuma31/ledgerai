import ForecastBadge from "@/components/ForecastBadge";
import type { CategoryProjection } from "@/types/forecast";

function formatAmount(amount: number | null): string {
  return amount === null ? "—" : `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default function ForecastTable({
  categoryProjections,
}: {
  categoryProjections: CategoryProjection[];
}) {
  if (categoryProjections.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Set up a budget to see projected category spending.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 font-medium">Category</th>
            <th className="px-2 py-1.5 text-right font-medium">Current</th>
            <th className="px-2 py-1.5 text-right font-medium">Projected</th>
            <th className="px-2 py-1.5 text-right font-medium">Budget</th>
            <th className="px-2 py-1.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {categoryProjections.map((c) => (
            <tr key={c.category} className="border-t">
              <td className="px-2 py-1.5 font-medium">{c.category}</td>
              <td className="px-2 py-1.5 text-right">{formatAmount(c.currentSpend)}</td>
              <td className="px-2 py-1.5 text-right">{formatAmount(c.projectedSpend)}</td>
              <td className="px-2 py-1.5 text-right">{formatAmount(c.budgetLimit)}</td>
              <td className="px-2 py-1.5">
                <ForecastBadge riskLevel={c.riskLevel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
