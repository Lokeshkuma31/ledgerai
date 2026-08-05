// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/jobs/engine", () => ({
  inngest: {
    createFunction: (opts: unknown, handler: unknown) => ({ opts, handler }),
  },
  JOB_PLATFORM_APP_ID: "ledgerai",
}));

const { defineJob } = await import("@/lib/jobs/worker");
const { retriesFor } = await import("@/lib/jobs/retry");

describe("defineJob", () => {
  it("wires id, triggers, and a default retries count derived from the job type", () => {
    const job = defineJob(
      { id: "feed-generate", trigger: { event: "ledger/transaction.classified" } },
      async () => ({}),
    ) as unknown as { opts: { id: string; triggers: unknown; retries: number; onFailure: unknown } };

    expect(job.opts.id).toBe("feed-generate");
    expect(job.opts.triggers).toEqual({ event: "ledger/transaction.classified" });
    expect(job.opts.retries).toBe(retriesFor("feed-generate"));
    expect(typeof job.opts.onFailure).toBe("function");
  });

  it("lets a caller override the default retry count", () => {
    const job = defineJob(
      { id: "custom-job", trigger: { event: "ledger/transaction.created" }, retries: 0 },
      async () => ({}),
    ) as unknown as { opts: { retries: number } };
    expect(job.opts.retries).toBe(0);
  });

  it("passes concurrency/priority/idempotency config straight through to Inngest", () => {
    const job = defineJob(
      {
        id: "sync-run",
        trigger: { event: "ledger/sync.started" },
        concurrency: { limit: 1, key: "event.data.organizationId" },
        idempotency: "event.data.syncJobId",
      },
      async () => ({}),
    ) as unknown as { opts: { concurrency: unknown; idempotency: string } };

    expect(job.opts.concurrency).toEqual({ limit: 1, key: "event.data.organizationId" });
    expect(job.opts.idempotency).toBe("event.data.syncJobId");
  });

  it("folds an explicit version into the display name (soft version marker)", () => {
    const job = defineJob(
      { id: "sync-run", name: "Sync Run", version: 2, trigger: { event: "ledger/sync.started" } },
      async () => ({}),
    ) as unknown as { opts: { name: string } };
    expect(job.opts.name).toBe("Sync Run (v2)");
  });
});
