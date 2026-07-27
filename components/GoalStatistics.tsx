import { Card, CardContent } from "@/components/ui/card";
import type { Goal, GoalProgress } from "@/types/goal";

function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default function GoalStatistics({
  goals,
  progressById,
}: {
  goals: Goal[];
  progressById: Map<string, GoalProgress>;
}) {
  const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
  const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  const completed = goals.filter((g) => progressById.get(g.id)?.status === "completed").length;
  const overdue = goals.filter((g) => progressById.get(g.id)?.status === "overdue").length;
  const averageProgress =
    goals.length === 0
      ? 0
      : goals.reduce((sum, g) => sum + (progressById.get(g.id)?.percentComplete ?? 0), 0) / goals.length;

  return (
    <Card size="sm">
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Goals" value={goals.length} />
        <Stat label="Completed" value={completed} />
        <Stat label="Overdue" value={overdue} />
        <Stat label="Average Progress" value={`${Math.round(averageProgress)}%`} />
        <Stat label="Total Saved" value={formatCurrency(totalSaved)} />
        <Stat label="Total Target" value={formatCurrency(totalTarget)} />
      </CardContent>
    </Card>
  );
}
