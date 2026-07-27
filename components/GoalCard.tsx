import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import GoalForm from "@/components/GoalForm";
import GoalProgress from "@/components/GoalProgress";
import { markGoalCompleted } from "@/lib/goals/storage";
import type { Goal, GoalProgress as GoalProgressData } from "@/types/goal";

function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default function GoalCard({
  goal,
  progress,
  onChange,
}: {
  goal: Goal;
  progress: GoalProgressData;
  onChange: (goals: Goal[]) => void;
}) {
  function handleMarkCompleted() {
    onChange(markGoalCompleted(goal.id));
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium">
            <span aria-hidden="true">{goal.icon}</span>
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: goal.color }} />
            {goal.name}
          </span>
          <GoalForm
            mode="edit"
            goal={goal}
            onSave={onChange}
            trigger={
              <Button variant="outline" size="sm">
                Edit
              </Button>
            }
          />
        </div>
        <span className="text-sm font-semibold">
          {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
        </span>
        <GoalProgress progress={progress} />
        <p className="text-muted-foreground text-xs">
          {progress.daysRemaining >= 0
            ? `${progress.daysRemaining} day${progress.daysRemaining === 1 ? "" : "s"} remaining`
            : `${Math.abs(progress.daysRemaining)} day${Math.abs(progress.daysRemaining) === 1 ? "" : "s"} overdue`}
        </p>
        <p className="text-sm">{progress.message}</p>
        {progress.status !== "completed" && (
          <div className="flex justify-end pt-1">
            <Button variant="outline" size="sm" onClick={handleMarkCompleted}>
              Mark Completed
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
