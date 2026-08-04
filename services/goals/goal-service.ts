/**
 * Goal Service — the async, Postgres-backed successor to
 * lib/goals/storage.ts. lib/goals/engine.ts::deriveGoalStatus is pure and
 * unchanged; this service calls it before every write, exactly mirroring
 * storage.ts's own build-draft-then-derive-status sequencing, since Goal
 * (unlike Budget) persists its status rather than computing it purely at
 * read time.
 */
import { deriveGoalStatus } from "@/lib/goals/engine";
import * as goalRepository from "@/repositories/goal-repository";
import type { Goal } from "@/types/goal";
import {
  goalInputSchema,
  updateGoalInputSchema,
  type GoalInput,
  type UpdateGoalInput,
} from "./goal-schema";

export async function listGoals(organizationId: string): Promise<Goal[]> {
  return goalRepository.getGoals(organizationId);
}

export async function addGoal(organizationId: string, input: GoalInput): Promise<Goal> {
  const parsed = goalInputSchema.parse(input);
  const now = new Date();
  const draft: Goal = {
    id: "",
    ...parsed,
    status: "not-started",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const status = deriveGoalStatus(draft, now);
  return goalRepository.addGoal(organizationId, parsed, status);
}

export async function updateGoal(
  organizationId: string,
  input: UpdateGoalInput,
): Promise<Goal> {
  const parsed = updateGoalInputSchema.parse(input);
  const existing = await goalRepository.getGoalById(organizationId, parsed.id);
  if (!existing) throw new Error(`Goal not found: ${parsed.id}`);

  const now = new Date();
  const merged: Goal = { ...existing, ...parsed.patch, updatedAt: now.toISOString() };
  const status = deriveGoalStatus(merged, now);
  return goalRepository.updateGoal(organizationId, parsed.id, parsed.patch, status);
}

/** Sets currentAmount to targetAmount so the goal reads as complete
 * everywhere — mirrors lib/goals/storage.ts::markGoalCompleted exactly. */
export async function markGoalCompleted(organizationId: string, id: string): Promise<Goal> {
  const existing = await goalRepository.getGoalById(organizationId, id);
  if (!existing) throw new Error(`Goal not found: ${id}`);

  const now = new Date();
  const merged: Goal = { ...existing, currentAmount: existing.targetAmount, updatedAt: now.toISOString() };
  const status = deriveGoalStatus(merged, now);
  return goalRepository.updateGoal(
    organizationId,
    id,
    { currentAmount: existing.targetAmount },
    status,
  );
}

export async function deleteGoal(organizationId: string, id: string): Promise<void> {
  return goalRepository.deleteGoal(organizationId, id);
}
