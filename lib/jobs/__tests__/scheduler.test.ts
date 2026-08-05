// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/jobs/engine", () => ({
  inngest: {
    createFunction: (opts: unknown) => ({ opts }),
  },
  JOB_PLATFORM_APP_ID: "ledgerai",
}));

const { registerSchedule } = await import("@/lib/jobs/scheduler");

describe("registerSchedule", () => {
  it("registers a cron trigger with the given expression", () => {
    const job = registerSchedule({ id: "recurring-detect", cron: "0 3 * * *" }, async () => ({})) as unknown as {
      opts: { id: string; triggers: unknown; retries: number };
    };
    expect(job.opts.id).toBe("recurring-detect");
    expect(job.opts.triggers).toEqual({ cron: "0 3 * * *" });
  });

  it("defaults scheduled jobs to a conservative retry count of 2", () => {
    const job = registerSchedule({ id: "cleanup", cron: "0 2 * * *" }, async () => ({})) as unknown as {
      opts: { retries: number };
    };
    expect(job.opts.retries).toBe(2);
  });

  it("lets a caller override the schedule's default retry count", () => {
    const job = registerSchedule({ id: "cleanup", cron: "0 2 * * *", retries: 1 }, async () => ({})) as unknown as {
      opts: { retries: number };
    };
    expect(job.opts.retries).toBe(1);
  });
});
