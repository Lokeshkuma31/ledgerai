/**
 * Goal Repository — Postgres-backed persistence for lib/goals/storage.ts's
 * successor. Unlike Budget, Goal.status is recomputed AND written back on
 * every mutation (lib/goals/engine.ts::deriveGoalStatus stays pure and
 * unchanged; this repository just persists whatever status the caller
 * already derived), since the app filters/indexes on status directly
 * (@@index([organizationId, status])).
 */
import { prisma } from "@/lib/db/prisma";
import type { Goal as PrismaGoal } from "@/src/generated/prisma/client";
import type { Goal, GoalStatus } from "@/types/goal";

const STATUS_TO_DB: Record<GoalStatus, PrismaGoal["status"]> = {
  "not-started": "NOT_STARTED",
  "in-progress": "IN_PROGRESS",
  completed: "COMPLETED",
  overdue: "OVERDUE",
};
const STATUS_FROM_DB: Record<PrismaGoal["status"], GoalStatus> = {
  NOT_STARTED: "not-started",
  IN_PROGRESS: "in-progress",
  COMPLETED: "completed",
  OVERDUE: "overdue",
};

function toGoal(row: PrismaGoal): Goal {
  return {
    id: row.id,
    name: row.name,
    targetAmount: row.targetAmount.toNumber(),
    currentAmount: row.currentAmount.toNumber(),
    targetDate: row.targetDate.toISOString().slice(0, 10),
    icon: row.icon,
    color: row.color,
    status: STATUS_FROM_DB[row.status],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getGoalById(
  organizationId: string,
  id: string,
): Promise<Goal | undefined> {
  const row = await prisma.goal.findFirst({ where: { id, organizationId, deletedAt: null } });
  return row ? toGoal(row) : undefined;
}

export async function getGoals(organizationId: string): Promise<Goal[]> {
  const rows = await prisma.goal.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toGoal);
}

export interface GoalInput {
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  icon: string;
  color: string;
}

export async function addGoal(
  organizationId: string,
  input: GoalInput,
  status: GoalStatus,
): Promise<Goal> {
  const row = await prisma.goal.create({
    data: {
      organizationId,
      name: input.name,
      targetAmount: input.targetAmount.toFixed(2),
      currentAmount: input.currentAmount.toFixed(2),
      targetDate: new Date(input.targetDate),
      icon: input.icon,
      color: input.color,
      status: STATUS_TO_DB[status],
    },
  });
  return toGoal(row);
}

export async function updateGoal(
  organizationId: string,
  id: string,
  patch: Partial<GoalInput>,
  status: GoalStatus,
): Promise<Goal> {
  const { count } = await prisma.goal.updateMany({
    where: { id, organizationId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.targetAmount !== undefined ? { targetAmount: patch.targetAmount.toFixed(2) } : {}),
      ...(patch.currentAmount !== undefined ? { currentAmount: patch.currentAmount.toFixed(2) } : {}),
      ...(patch.targetDate !== undefined ? { targetDate: new Date(patch.targetDate) } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      status: STATUS_TO_DB[status],
    },
  });
  if (count === 0) throw new Error(`Goal not found: ${id}`);
  const row = await prisma.goal.findUniqueOrThrow({ where: { id } });
  return toGoal(row);
}

export async function deleteGoal(organizationId: string, id: string): Promise<void> {
  await prisma.goal.deleteMany({ where: { id, organizationId } });
}
