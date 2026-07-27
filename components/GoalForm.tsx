"use client";

import { type ReactElement, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addGoal, deleteGoal, updateGoal, type GoalInput } from "@/lib/goals/storage";
import type { Goal } from "@/types/goal";

const ICON_OPTIONS = ["🎯", "✈️", "🏠", "🚗", "🎓", "💍", "👶", "🏥", "💻", "🎉"];
const COLOR_OPTIONS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

type GoalFormProps =
  | { mode: "create"; onSave: (goals: Goal[]) => void; trigger: ReactElement }
  | { mode: "edit"; goal: Goal; onSave: (goals: Goal[]) => void; trigger: ReactElement };

function oneYearFromNow(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export default function GoalForm(props: GoalFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(props.mode === "edit" ? props.goal.name : "");
  const [targetAmount, setTargetAmount] = useState(
    props.mode === "edit" ? String(props.goal.targetAmount) : "",
  );
  const [currentAmount, setCurrentAmount] = useState(
    props.mode === "edit" ? String(props.goal.currentAmount) : "0",
  );
  const [targetDate, setTargetDate] = useState(
    props.mode === "edit" ? props.goal.targetDate : oneYearFromNow(),
  );
  const [icon, setIcon] = useState(props.mode === "edit" ? props.goal.icon : ICON_OPTIONS[0]);
  const [color, setColor] = useState(props.mode === "edit" ? props.goal.color : COLOR_OPTIONS[0]);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setError(null);
    if (props.mode === "edit") {
      setName(props.goal.name);
      setTargetAmount(String(props.goal.targetAmount));
      setCurrentAmount(String(props.goal.currentAmount));
      setTargetDate(props.goal.targetDate);
      setIcon(props.goal.icon);
      setColor(props.goal.color);
    } else {
      setName("");
      setTargetAmount("");
      setCurrentAmount("0");
      setTargetDate(oneYearFromNow());
      setIcon(ICON_OPTIONS[0]);
      setColor(COLOR_OPTIONS[0]);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetForm();
  }

  const numericTarget = Number(targetAmount);
  const numericCurrent = Number(currentAmount);
  const isValid =
    name.trim().length > 0 && numericTarget > 0 && numericCurrent >= 0 && targetDate.length > 0;

  function handleSave() {
    if (!isValid) return;
    setError(null);
    try {
      const input: GoalInput = {
        name: name.trim(),
        targetAmount: numericTarget,
        currentAmount: numericCurrent,
        targetDate,
        icon,
        color,
      };
      const updated = props.mode === "create" ? addGoal(input) : updateGoal(props.goal.id, input);
      props.onSave(updated);
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function handleDelete() {
    if (props.mode !== "edit") return;
    const updated = deleteGoal(props.goal.id);
    props.onSave(updated);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={props.trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.mode === "create" ? "Create Goal" : "Edit Goal"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goalName">Name</Label>
            <Input
              id="goalName"
              placeholder="Vacation"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goalTarget">Target Amount</Label>
              <Input
                id="goalTarget"
                type="number"
                min="0"
                step="1"
                placeholder="0.00"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goalCurrent">Current Amount</Label>
              <Input
                id="goalCurrent"
                type="number"
                min="0"
                step="1"
                placeholder="0.00"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goalDate">Target Date</Label>
            <Input
              id="goalDate"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-1.5">
              {ICON_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setIcon(option)}
                  className={`rounded-lg border px-2 py-1 text-lg transition-colors ${
                    icon === option ? "border-ring bg-muted" : "border-border hover:bg-muted/50"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setColor(option)}
                  aria-label={option}
                  className={`h-6 w-6 rounded-full border-2 transition-transform ${
                    color === option ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: option }}
                />
              ))}
            </div>
          </div>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          {props.mode === "edit" && (
            <Button variant="destructive" onClick={handleDelete} className="sm:mr-auto">
              Delete
            </Button>
          )}
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button onClick={handleSave} disabled={!isValid}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
