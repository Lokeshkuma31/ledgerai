import { beforeEach, describe, expect, it } from "vitest";
import { registerSyncProvider } from "@/lib/sync/registry";
import { getSyncJobsByProvider, getLatestSyncJob } from "@/lib/sync/history";
import {
  cancelSync,
  getProviderHealth,
  getQueueSnapshot,
  pauseSync,
  resumeSync,
  retrySync,
  setConcurrencyLimit,
  startSync,
  waitForSyncJob,
} from "@/lib/sync/engine";
import type {
  SyncCursor,
  SyncExecutionInput,
  SyncExecutionResult,
  SyncProvider,
  SyncProviderHealthSnapshot,
} from "@/lib/sync/types";

let idCounter = 0;
/** A fresh, uncollided provider id per test — the queue/history are
 * module-level singletons (in-memory for the queue, localStorage for
 * history), so unique ids are what actually isolates one test from the
 * next, the same role BANK_A/BANK_B play in lib/banks/__tests__. */
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

type SyncAction = { result: SyncExecutionResult } | { throw: Error } | { delayMs: number; result: SyncExecutionResult };

/** A fully scriptable fake provider: each call to sync() pops the next
 * queued action (or repeats the last one once the queue is exhausted),
 * letting a test simulate a provider whose behavior changes across
 * successive syncs (incremental, retry-after-recovery, resume). */
function createFakeProvider(id: string, actions: SyncAction[], healthStatus: SyncProviderHealthSnapshot["status"] = "healthy") {
  let cursor: SyncCursor | null = null;
  let callCount = 0;
  const calls: SyncExecutionInput[] = [];

  const provider: SyncProvider = {
    id,
    name: id,
    category: "other",
    recommendedSchedule: "manual",
    supportsIncremental: true,
    getCursor: () => cursor,
    async sync(input: SyncExecutionInput): Promise<SyncExecutionResult> {
      calls.push(input);
      const action = actions[Math.min(callCount, actions.length - 1)];
      callCount += 1;

      if ("throw" in action) throw action.throw;

      if ("delayMs" in action) {
        await new Promise((resolve) => setTimeout(resolve, action.delayMs));
        if (input.signal.aborted) {
          return { ...action.result, itemsImported: 0, checkpoint: "aborted-checkpoint" };
        }
      }

      if (action.result.nextCursor) cursor = action.result.nextCursor;
      return action.result;
    },
    async health(): Promise<SyncProviderHealthSnapshot> {
      return { status: healthStatus, message: "fake provider", checkedAt: new Date().toISOString() };
    },
  };

  return { provider, calls };
}

function result(overrides: Partial<SyncExecutionResult> = {}): SyncExecutionResult {
  return {
    itemsDiscovered: 0,
    itemsImported: 0,
    itemsSkipped: 0,
    duplicates: 0,
    errors: [],
    warnings: [],
    nextCursor: null,
    checkpoint: null,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  setConcurrencyLimit(2);
});

describe("Successful Sync", () => {
  it("imports every item and records a completed job", async () => {
    const id = nextId("bank");
    const { provider } = createFakeProvider(id, [{ result: result({ itemsDiscovered: 10, itemsImported: 10 }) }]);
    registerSyncProvider(provider);

    const job = startSync(id, "initial")!;
    const finished = await waitForSyncJob(job.id);

    expect(finished!.status).toBe("completed");
    expect(finished!.itemsImported).toBe(10);
    expect(getSyncJobsByProvider(id)).toHaveLength(1);
    expect(getLatestSyncJob(id)?.status).toBe("completed");
  });
});

describe("Incremental Sync", () => {
  it("only processes the provider's incremental subset on the second run", async () => {
    const id = nextId("email");
    const { provider, calls } = createFakeProvider(id, [
      { result: result({ itemsDiscovered: 20, itemsImported: 20, nextCursor: { value: "cursor-1", updatedAt: new Date().toISOString() } }) },
      { result: result({ itemsDiscovered: 3, itemsImported: 3, nextCursor: { value: "cursor-2", updatedAt: new Date().toISOString() } }) },
    ]);
    registerSyncProvider(provider);

    const first = startSync(id, "initial")!;
    await waitForSyncJob(first.id);
    const second = startSync(id, "incremental")!;
    const finished = await waitForSyncJob(second.id);

    expect(finished!.itemsImported).toBe(3);
    expect(calls[1].mode).toBe("incremental");
    expect(calls[1].cursor?.value).toBe("cursor-1"); // the provider's own advanced cursor from run 1
  });
});

describe("Cancelled Sync", () => {
  it("aborts the provider's signal and records a cancelled job", async () => {
    const id = nextId("sms");
    const { provider } = createFakeProvider(id, [{ delayMs: 200, result: result({ itemsDiscovered: 5, itemsImported: 5 }) }]);
    registerSyncProvider(provider);

    const job = startSync(id, "manual")!;
    // Give the queue a tick to actually start the job before cancelling it.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const cancelled = cancelSync(job.id);
    const finished = await waitForSyncJob(job.id);

    expect(cancelled).toBe(true);
    expect(finished!.status).toBe("cancelled");
  });
});

describe("Retry", () => {
  it("re-runs a failed provider's most recent job and succeeds once it recovers", async () => {
    const id = nextId("document");
    const { provider } = createFakeProvider(id, [
      { throw: new Error("simulated upstream outage") },
      { result: result({ itemsDiscovered: 4, itemsImported: 4 }) },
    ]);
    registerSyncProvider(provider);

    const job = startSync(id, "manual")!;
    const failed = await waitForSyncJob(job.id);
    expect(failed!.status).toBe("failed");

    const retryJob = retrySync(id)!;
    expect(retryJob).toBeDefined();
    const retried = await waitForSyncJob(retryJob.id);

    expect(retried!.status).toBe("completed");
    expect(retried!.retryCount).toBe(1);
  });

  it("returns undefined when there's nothing to retry", async () => {
    const id = nextId("clean");
    const { provider } = createFakeProvider(id, [{ result: result({ itemsDiscovered: 1, itemsImported: 1 }) }]);
    registerSyncProvider(provider);

    const job = startSync(id, "manual")!;
    await waitForSyncJob(job.id);

    expect(retrySync(id)).toBeUndefined();
  });
});

describe("Provider Offline", () => {
  it("reflects a provider's own offline health check in its computed health", async () => {
    const id = nextId("offline");
    const { provider } = createFakeProvider(id, [{ throw: new Error("connection refused") }], "offline");
    registerSyncProvider(provider);

    const job = startSync(id, "manual")!;
    await waitForSyncJob(job.id);

    const health = await getProviderHealth(id);
    expect(health?.connection.status).toBe("offline");
    expect(health?.failedJobs).toBe(1);
  });
});

describe("Duplicate Import", () => {
  it("records the provider-reported duplicate count on the job", async () => {
    const id = nextId("dupe");
    const { provider } = createFakeProvider(id, [
      { result: result({ itemsDiscovered: 10, itemsImported: 6, duplicates: 4 }) },
    ]);
    registerSyncProvider(provider);

    const job = startSync(id, "manual")!;
    const finished = await waitForSyncJob(job.id);

    expect(finished!.duplicates).toBe(4);
    expect(finished!.itemsImported).toBe(6);
  });
});

describe("Checkpoint Resume", () => {
  it("carries the prior job's checkpoint into the next sync's input", async () => {
    const id = nextId("resume");
    const { provider, calls } = createFakeProvider(id, [
      { result: result({ itemsDiscovered: 100, itemsImported: 40, checkpoint: "batch-40" }) },
      { result: result({ itemsDiscovered: 60, itemsImported: 60, checkpoint: null }) },
    ]);
    registerSyncProvider(provider);

    const first = startSync(id, "initial")!;
    const firstFinished = await waitForSyncJob(first.id);
    expect(firstFinished!.status).toBe("partial"); // items imported but a checkpoint remains — not fully caught up
    expect(firstFinished!.lastCheckpoint).toBe("batch-40");

    const resumed = resumeSync(id)!;
    expect(resumed).toBeDefined();
    const finished = await waitForSyncJob(resumed.id);

    expect(calls[1].checkpoint).toBe("batch-40");
    expect(finished!.itemsImported).toBe(60);
    expect(finished!.lastCheckpoint).toBeNull();
  });
});

describe("Large Batch", () => {
  it("records a large item count on a single job without special-casing", async () => {
    const id = nextId("large");
    const { provider } = createFakeProvider(id, [{ result: result({ itemsDiscovered: 500, itemsImported: 500 }) }]);
    registerSyncProvider(provider);

    const job = startSync(id, "initial")!;
    const finished = await waitForSyncJob(job.id);

    expect(finished!.status).toBe("completed");
    expect(finished!.itemsImported).toBe(500);
  });
});

describe("Empty Sync", () => {
  it("completes cleanly with zero items and no errors", async () => {
    const id = nextId("empty");
    const { provider } = createFakeProvider(id, [{ result: result() }]);
    registerSyncProvider(provider);

    const job = startSync(id, "incremental")!;
    const finished = await waitForSyncJob(job.id);

    expect(finished!.status).toBe("completed");
    expect(finished!.itemsDiscovered).toBe(0);
    expect(finished!.itemsImported).toBe(0);
    expect(finished!.errors).toHaveLength(0);
  });
});

describe("Queue Recovery", () => {
  it("keeps a second job queued under the concurrency limit, then drains it once a slot frees up", async () => {
    setConcurrencyLimit(1);
    const idA = nextId("queue-a");
    const idB = nextId("queue-b");
    const { provider: providerA } = createFakeProvider(idA, [{ delayMs: 50, result: result({ itemsImported: 1 }) }]);
    const { provider: providerB } = createFakeProvider(idB, [{ result: result({ itemsImported: 2 }) }]);
    registerSyncProvider(providerA);
    registerSyncProvider(providerB);

    const jobA = startSync(idA, "manual")!;
    const jobB = startSync(idB, "manual")!;

    // With concurrency limit 1, B should still be queued right after both starts.
    const snapshotWhileRunning = getQueueSnapshot();
    expect(snapshotWhileRunning.running.some((j) => j.id === jobA.id)).toBe(true);
    expect(snapshotWhileRunning.queued.some((j) => j.id === jobB.id)).toBe(true);

    const finishedA = await waitForSyncJob(jobA.id);
    const finishedB = await waitForSyncJob(jobB.id);

    expect(finishedA!.status).toBe("completed");
    expect(finishedB!.status).toBe("completed");
    expect(getQueueSnapshot().queued).toHaveLength(0);
    expect(getQueueSnapshot().running).toHaveLength(0);
  });

  it("prevents a duplicate job while one is already active for the same provider", async () => {
    const id = nextId("nodupe");
    const { provider } = createFakeProvider(id, [{ delayMs: 30, result: result({ itemsImported: 1 }) }]);
    registerSyncProvider(provider);

    const first = startSync(id, "manual")!;
    const second = startSync(id, "manual");

    expect(second).toBeUndefined();
    await waitForSyncJob(first.id);
  });
});

describe("Pause / Resume", () => {
  it("pauses a running job as resumable rather than terminal", async () => {
    const id = nextId("pause");
    const { provider } = createFakeProvider(id, [
      { delayMs: 200, result: result({ itemsImported: 0, checkpoint: "paused-checkpoint" }) },
      { result: result({ itemsImported: 5, checkpoint: null }) },
    ]);
    registerSyncProvider(provider);

    const job = startSync(id, "manual")!;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const paused = pauseSync(job.id);
    const finished = await waitForSyncJob(job.id);

    expect(paused).toBe(true);
    expect(finished!.status).toBe("paused");

    const resumedJob = resumeSync(id)!;
    expect(resumedJob).toBeDefined();
    const resumedFinished = await waitForSyncJob(resumedJob.id);
    expect(resumedFinished!.status).toBe("completed");
  });
});

describe("resolveConflicts", () => {
  it("splits new items from duplicates/updates via a caller-supplied detector", async () => {
    const { resolveConflicts } = await import("@/lib/sync/conflict");
    interface Item {
      externalId: string;
      amount: number;
    }
    const existing: Item[] = [{ externalId: "a", amount: 100 }];
    const incoming: Item[] = [
      { externalId: "a", amount: 100 }, // pure duplicate
      { externalId: "a", amount: 150 }, // updated
      { externalId: "b", amount: 50 }, // genuinely new
    ];

    const outcome = resolveConflicts(incoming, existing, {
      findExisting: (item, existingItems) => existingItems.find((e) => e.externalId === item.externalId),
      isIdentical: (item, match) => item.amount === match.amount,
      identify: (item) => item.externalId,
    });

    expect(outcome.toImport).toHaveLength(1);
    expect(outcome.toImport[0].externalId).toBe("b");
    expect(outcome.conflicts).toHaveLength(2);
    expect(outcome.conflicts.find((c) => c.type === "duplicate-transaction")).toBeDefined();
    expect(outcome.conflicts.find((c) => c.type === "updated-transaction")).toBeDefined();
  });
});
