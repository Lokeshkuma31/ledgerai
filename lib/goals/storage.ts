import { deriveGoalStatus } from "@/lib/goals/engine";
import type { Goal } from "@/types/goal";

const STORAGE_KEY = "ledgerai:goals";

function readGoals(): Goal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Goal[]) : [];
  } catch {
    return [];
  }
}

function writeGoals(goals: Goal[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
}

export function getGoals(): Goal[] {
  return readGoals();
}

export interface GoalInput {
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  icon: string;
  color: string;
}

export function addGoal(input: GoalInput): Goal[] {
  const now = new Date();
  const timestamp = now.toISOString();
  const draft: Goal = {
    id: crypto.randomUUID(),
    ...input,
    status: "not-started",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const goal: Goal = { ...draft, status: deriveGoalStatus(draft, now) };
  const updated = [...readGoals(), goal];
  writeGoals(updated);
  return updated;
}

export function updateGoal(id: string, patch: Partial<GoalInput>): Goal[] {
  const now = new Date();
  const updated = readGoals().map((g) => {
    if (g.id !== id) return g;
    const merged: Goal = { ...g, ...patch, updatedAt: now.toISOString() };
    return { ...merged, status: deriveGoalStatus(merged, now) };
  });
  writeGoals(updated);
  return updated;
}

/** Sets currentAmount to targetAmount so the goal reads as complete
 * everywhere — no separate "completed" override flag needed. */
export function markGoalCompleted(id: string): Goal[] {
  const now = new Date();
  const updated = readGoals().map((g) => {
    if (g.id !== id) return g;
    const merged: Goal = { ...g, currentAmount: g.targetAmount, updatedAt: now.toISOString() };
    return { ...merged, status: deriveGoalStatus(merged, now) };
  });
  writeGoals(updated);
  return updated;
}

export function deleteGoal(id: string): Goal[] {
  const updated = readGoals().filter((g) => g.id !== id);
  writeGoals(updated);
  return updated;
}
