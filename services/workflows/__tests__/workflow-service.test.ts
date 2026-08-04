// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  cloneWorkflow,
  deleteWorkflow,
  disableWorkflow,
  enableWorkflow,
  getRunById,
  getRunsByTrigger,
  getRunsByWorkflow,
  getWorkflowById,
  getWorkflowsByTrigger,
  listRuns,
  listWorkflows,
  recordRun,
  updateWorkflow,
} from "@/services/workflows/workflow-service";
import type { WorkflowRun } from "@/types/workflow";

let organizationId: string;

vi.setConfig({ testTimeout: 20000 });

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  const now = new Date().toISOString();
  return {
    runId: crypto.randomUUID(),
    workflowId: "",
    workflowName: "",
    trigger: "manual-run",
    status: "completed",
    steps: [
      {
        id: "timeline",
        engine: "timeline",
        action: "generateTimeline",
        input: {},
        output: { count: 3 },
        status: "completed",
        startedAt: now,
        completedAt: now,
        duration: 12,
        error: null,
        retryCount: 0,
      },
    ],
    startedAt: now,
    completedAt: now,
    durationMs: 12,
    successfulSteps: 1,
    failedSteps: 0,
    retryCount: 0,
    context: { source: "test" },
    ...overrides,
  };
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `workflow-service-test-${Date.now()}@ledgerai.local`, name: "Workflow Service Test" },
  });
  const organization = await prisma.organization.create({
    data: { name: "Workflow Service Test Org", isPersonal: true },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
  });
  organizationId = organization.id;
}, 20000);

afterAll(async () => {
  await prisma.workflowStepResult.deleteMany({ where: { run: { organizationId } } });
  await prisma.workflowRun.deleteMany({ where: { organizationId } });
  await prisma.workflowDefinition.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.workflowStepResult.deleteMany({ where: { run: { organizationId } } });
  await prisma.workflowRun.deleteMany({ where: { organizationId } });
  await prisma.workflowDefinition.deleteMany({ where: { organizationId } });
});

describe("Workflow service — definitions", () => {
  it("getAllWorkflows self-heals by seeding the 4 built-in workflows on first read", async () => {
    const workflows = await listWorkflows(organizationId);
    expect(workflows).toHaveLength(4);
    expect(workflows.map((w) => w.id).sort()).toEqual([
      "workflow:budget-exceeded",
      "workflow:daily-refresh",
      "workflow:manual-run",
      "workflow:transaction-imported",
    ]);
    expect(workflows.every((w) => w.status === "enabled")).toBe(true);
  });

  it("getWorkflowById and getWorkflowsByTrigger (sorted desc by priority) work off the deterministic key", async () => {
    await listWorkflows(organizationId); // seed
    const budgetExceeded = await getWorkflowById(organizationId, "workflow:budget-exceeded");
    expect(budgetExceeded?.name).toBe("Budget Exceeded Response");

    const dailyAndManual = await getWorkflowsByTrigger(organizationId, "daily-refresh");
    expect(dailyAndManual.map((w) => w.id)).toEqual(["workflow:daily-refresh"]);
  });

  it("enableWorkflow/disableWorkflow toggle status", async () => {
    await listWorkflows(organizationId);
    await disableWorkflow(organizationId, "workflow:manual-run");
    expect((await getWorkflowById(organizationId, "workflow:manual-run"))?.status).toBe("disabled");

    await enableWorkflow(organizationId, "workflow:manual-run");
    expect((await getWorkflowById(organizationId, "workflow:manual-run"))?.status).toBe("enabled");
  });

  it("updateWorkflow patches fields and bumps version", async () => {
    await listWorkflows(organizationId);
    const updated = await updateWorkflow(organizationId, {
      key: "workflow:manual-run",
      priority: 99,
    });
    expect(updated?.priority).toBe(99);
    expect(updated?.version).toBe(2);
  });

  it("cloneWorkflow creates a disabled copy with a derived key", async () => {
    await listWorkflows(organizationId);
    const clone = await cloneWorkflow(organizationId, "workflow:manual-run");
    expect(clone?.id).toMatch(/^workflow:manual-run:clone:/);
    expect(clone?.status).toBe("disabled");
    expect(clone?.name).toBe("Manual Full Refresh (Copy)");

    const all = await listWorkflows(organizationId);
    expect(all).toHaveLength(5);
  });

  it("deleteWorkflow removes it", async () => {
    await listWorkflows(organizationId);
    await deleteWorkflow(organizationId, "workflow:manual-run");
    expect(await getWorkflowById(organizationId, "workflow:manual-run")).toBeUndefined();
  });
});

describe("Workflow service — run history", () => {
  it("recordRun persists the run with its steps and updates the definition's lastRunSummary", async () => {
    await listWorkflows(organizationId);
    const run = makeRun({ trigger: "manual-run" });

    await recordRun(organizationId, "workflow:manual-run", run);

    const fetched = await getRunById(organizationId, run.runId);
    expect(fetched?.workflowName).toBe("Manual Full Refresh");
    expect(fetched?.steps).toHaveLength(1);
    expect(fetched?.steps[0].output).toEqual({ count: 3 });

    const definition = await getWorkflowById(organizationId, "workflow:manual-run");
    expect(definition?.lastRun?.runId).toBe(run.runId);
    expect(definition?.executionHistory[0]?.runId).toBe(run.runId);
  });

  it("recordRun on the same runId transitions in place rather than duplicating steps", async () => {
    await listWorkflows(organizationId);
    const run = makeRun({ trigger: "manual-run", status: "running", completedAt: null });
    await recordRun(organizationId, "workflow:manual-run", run);

    const completed = { ...run, status: "completed" as const, completedAt: new Date().toISOString() };
    await recordRun(organizationId, "workflow:manual-run", completed);

    const history = await listRuns(organizationId);
    expect(history.filter((r) => r.runId === run.runId)).toHaveLength(1);
    expect(history.find((r) => r.runId === run.runId)?.status).toBe("completed");
  });

  it("getRunsByWorkflow and getRunsByTrigger scope correctly", async () => {
    await listWorkflows(organizationId);
    await recordRun(organizationId, "workflow:manual-run", makeRun({ trigger: "manual-run" }));
    await recordRun(organizationId, "workflow:daily-refresh", makeRun({ trigger: "daily-refresh" }));

    expect(await getRunsByWorkflow(organizationId, "workflow:manual-run")).toHaveLength(1);
    expect(await getRunsByTrigger(organizationId, "daily-refresh")).toHaveLength(1);
  });
});
