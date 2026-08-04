// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  addGoal,
  deleteGoal,
  listGoals,
  markGoalCompleted,
  updateGoal,
} from "@/services/goals/goal-service";
import type { GoalInput } from "@/services/goals/goal-schema";

let organizationId: string;

vi.setConfig({ testTimeout: 20000 });

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function baseInput(overrides: Partial<GoalInput> = {}): GoalInput {
  return {
    name: "New Laptop",
    targetAmount: 100000,
    currentAmount: 0,
    targetDate: futureDate(90),
    icon: "\u{1F4BB}",
    color: "#4f46e5",
    ...overrides,
  };
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `goal-service-test-${Date.now()}@ledgerai.local`, name: "Goal Service Test" },
  });
  const organization = await prisma.organization.create({
    data: { name: "Goal Service Test Org", isPersonal: true },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
  });
  organizationId = organization.id;
}, 20000);

afterAll(async () => {
  await prisma.goal.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.goal.deleteMany({ where: { organizationId } });
});

describe("Goal service", () => {
  it("addGoal derives status not-started when currentAmount is zero", async () => {
    const goal = await addGoal(organizationId, baseInput({ currentAmount: 0 }));
    expect(goal.status).toBe("not-started");

    const [listed] = await listGoals(organizationId);
    expect(listed.id).toBe(goal.id);
  });

  it("addGoal derives status in-progress when partially funded", async () => {
    const goal = await addGoal(organizationId, baseInput({ currentAmount: 25000 }));
    expect(goal.status).toBe("in-progress");
  });

  it("addGoal derives status completed when currentAmount already meets target", async () => {
    const goal = await addGoal(organizationId, baseInput({ targetAmount: 5000, currentAmount: 5000 }));
    expect(goal.status).toBe("completed");
  });

  it("addGoal derives status overdue when the target date has already passed", async () => {
    const goal = await addGoal(organizationId, baseInput({ currentAmount: 100, targetDate: futureDate(-5) }));
    expect(goal.status).toBe("overdue");
  });

  it("updateGoal merges the patch and recomputes status", async () => {
    const goal = await addGoal(organizationId, baseInput({ targetAmount: 10000, currentAmount: 0 }));
    expect(goal.status).toBe("not-started");

    const updated = await updateGoal(organizationId, { id: goal.id, patch: { currentAmount: 10000 } });
    expect(updated.status).toBe("completed");
    expect(updated.currentAmount).toBe(10000);
    expect(updated.name).toBe(goal.name);
  });

  it("markGoalCompleted sets currentAmount to targetAmount and status to completed", async () => {
    const goal = await addGoal(organizationId, baseInput({ targetAmount: 20000, currentAmount: 5000 }));
    const completed = await markGoalCompleted(organizationId, goal.id);
    expect(completed.currentAmount).toBe(20000);
    expect(completed.status).toBe("completed");
  });

  it("deleteGoal removes it", async () => {
    const goal = await addGoal(organizationId, baseInput());
    await deleteGoal(organizationId, goal.id);
    expect(await listGoals(organizationId)).toHaveLength(0);
  });
});
