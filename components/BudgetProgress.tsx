import type { BudgetStatus, BudgetStatusLevel } from "@/types/budget";

const STATUS_STYLES: Record<
  BudgetStatusLevel,
  { bar: string; label: string; text: string }
> = {
  safe: {
    bar: "bg-emerald-500",
    label: "Safe",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    bar: "bg-amber-500",
    label: "Warning",
    text: "text-amber-600 dark:text-amber-400",
  },
  exceeded: {
    bar: "bg-destructive",
    label: "Exceeded",
    text: "text-destructive",
  },
};

export default function BudgetProgress({ status }: { status: BudgetStatus }) {
  const style = STATUS_STYLES[status.status];
  const barWidth = Math.min(100, Math.max(0, status.percentageUsed));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className={style.text}>{style.label}</span>
        <span className="text-muted-foreground">
          {Math.round(status.percentageUsed)}% used
        </span>
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${style.bar}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}
