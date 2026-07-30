import Link from "next/link";
import type { BudgetStatus, BudgetStatusLevel } from "@/types/budget";

const BAR_CLASSES: Record<BudgetStatusLevel, string> = {
  safe: "bg-success",
  warning: "bg-warning",
  exceeded: "bg-destructive",
};

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default function BudgetsMini({ statuses }: { statuses: BudgetStatus[] }) {
  if (statuses.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No budgets yet.{" "}
        <Link href="/budgets" className="text-primary hover:underline">
          Create one
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {statuses.slice(0, 4).map((status) => {
        const width = Math.min(100, Math.max(0, status.percentageUsed));
        return (
          <div key={status.id}>
            <div className="mb-1.5 flex items-center text-xs">
              <span className="text-muted-foreground font-medium">{status.category}</span>
              <span className="font-numeric text-foreground-subtle ml-auto">
                {formatAmount(status.currentSpend)} / {formatAmount(status.monthlyLimit)}
              </span>
            </div>
            <div className="bg-surface-2 h-1.5 overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${BAR_CLASSES[status.status]}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
