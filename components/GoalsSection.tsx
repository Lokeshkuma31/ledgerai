"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import GoalCard from "@/components/GoalCard";
import GoalForm from "@/components/GoalForm";
import GoalStatistics from "@/components/GoalStatistics";
import { computeGoalProgress } from "@/lib/goals/engine";
import { getGoals } from "@/lib/goals/storage";
import type { Goal, GoalProgress } from "@/types/goal";

/** Dashboard's "Savings Goals" section. `projectedMonthlySavings` is the
 * Cash Flow Forecast Engine's own expectedSavings (already computed by the
 * orchestrator) — this component only compares against it via
 * computeGoalProgress, it never recalculates a forecast itself. */
export default function GoalsSection({
  projectedMonthlySavings,
}: {
  projectedMonthlySavings: number | null;
}) {
  const [goals, setGoals] = useState<Goal[]>([]);

  useEffect(() => {
    setGoals(getGoals());
  }, []);

  const progressById = useMemo(() => {
    const now = new Date();
    const map = new Map<string, GoalProgress>();
    for (const goal of goals) {
      map.set(goal.id, computeGoalProgress(goal, now, projectedMonthlySavings));
    }
    return map;
  }, [goals, projectedMonthlySavings]);

  if (goals.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-muted-foreground">No savings goals yet.</p>
          <GoalForm mode="create" onSave={setGoals} trigger={<Button>Create Goal</Button>} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <GoalStatistics goals={goals} progressById={progressById} />
      <div className="flex justify-end">
        <GoalForm
          mode="create"
          onSave={setGoals}
          trigger={
            <Button variant="outline" size="sm">
              Add Goal
            </Button>
          }
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} progress={progressById.get(goal.id)!} onChange={setGoals} />
        ))}
      </div>
    </div>
  );
}
