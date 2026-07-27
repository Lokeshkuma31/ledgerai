import type { GoalProgress as GoalProgressData, GoalStatus } from "@/types/goal";

const STATUS_STYLES: Record<GoalStatus, { bar: string; label: string; text: string }> = {
  "not-started": {
    bar: "bg-muted-foreground/40",
    label: "Not Started",
    text: "text-muted-foreground",
  },
  "in-progress": {
    bar: "bg-blue-500",
    label: "In Progress",
    text: "text-blue-600 dark:text-blue-400",
  },
  completed: {
    bar: "bg-emerald-500",
    label: "Completed",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  overdue: {
    bar: "bg-destructive",
    label: "Overdue",
    text: "text-destructive",
  },
};

export default function GoalProgress({ progress }: { progress: GoalProgressData }) {
  const style = STATUS_STYLES[progress.status];
  const barWidth = Math.min(100, Math.max(0, progress.percentComplete));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className={style.text}>{style.label}</span>
        <span className="text-muted-foreground">{Math.round(progress.percentComplete)}% complete</span>
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${barWidth}%` }} />
      </div>
    </div>
  );
}
