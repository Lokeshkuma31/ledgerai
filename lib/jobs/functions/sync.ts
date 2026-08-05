/**
 * Sync jobs — sync-start (fires on a new connection) and sync-run (the
 * actual provider sync). No real provider API call is wired yet (Gmail/
 * Graph/Yahoo message fetching is a deferred integration — see
 * docs/job-platform/09-migration-plan.md §9.4); this establishes the full
 * job lifecycle, the per-provider mutex, checkpointing, and event fan-out
 * so a real provider call can be dropped into the marked step without
 * touching anything else. See docs/job-platform/03-job-dependency-graph.md
 * §3.4 and docs/job-platform/07-idempotency-design.md's Sync Jobs section.
 */
import { defineJob } from "@/lib/jobs/worker";
import { dispatch } from "@/lib/jobs/dispatcher";
import { buildKey } from "@/lib/jobs/idempotency";
import { mutex, globalConcurrency } from "@/lib/jobs/queue";
import * as syncJobService from "@/services/sync/sync-job-service";
import type { EventPayload } from "@/lib/jobs/events";
import type { ProviderCategoryInput } from "@/repositories/sync-job-repository";
import type { SyncJobType } from "@/lib/sync/types";

export const syncStart = defineJob<EventPayload<"ledger/connection.created">>(
  {
    id: "sync-start",
    name: "Sync Start (post-connection)",
    trigger: { event: "ledger/connection.created" },
    concurrency: globalConcurrency(25),
  },
  async ({ event, organizationId, correlationId }) => {
    if (!organizationId) return { skipped: true };
    const { connectionId, provider } = event.data;

    await dispatch(
      "ledger/sync.started",
      {
        organizationId,
        correlationId,
        connectionId,
        providerId: provider,
        providerCategory: "email",
        runType: "initial",
      },
      { id: buildKey("sync-started", organizationId, provider, "initial") },
    );
    return { dispatched: true };
  },
);

export const syncRun = defineJob<EventPayload<"ledger/sync.started">>(
  {
    id: "sync-run",
    name: "Sync Run",
    trigger: { event: "ledger/sync.started" },
    // One sync per (org, provider) at a time — prevents two overlapping
    // runs corrupting the same lastCheckpoint. See queue strategy §4.2.
    concurrency: [mutex("event.data.organizationId + \":\" + event.data.providerId"), globalConcurrency(25)],
  },
  async ({ event, organizationId, correlationId, step }) => {
    if (!organizationId) return { skipped: true };
    const { providerId, providerCategory, connectionId } = event.data;

    // Layer-2 idempotency backstop alongside the concurrency mutex above
    // (docs/job-platform/07-idempotency-design.md's Sync Jobs section):
    // skip if a run for this provider is already in flight.
    const existing = await step.run("check-in-flight", () => syncJobService.getLatestSyncJob(organizationId, providerId));
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      return { skipped: true, reason: "sync already in flight" };
    }

    const startedAt = new Date();
    const job = await step.run("record-running", () =>
      syncJobService.recordSyncJob(
        organizationId,
        {
          id: crypto.randomUUID(),
          provider: providerId,
          plugin: providerId,
          type: event.data.runType as SyncJobType,
          status: "running",
          startedAt: startedAt.toISOString(),
          completedAt: null,
          duration: null,
          itemsDiscovered: 0,
          itemsImported: 0,
          itemsSkipped: 0,
          duplicates: 0,
          errors: [],
          warnings: [],
          retryCount: 0,
          lastCheckpoint: null,
          metadata: { connectionId },
          queuedAt: startedAt.toISOString(),
        },
        providerCategory as ProviderCategoryInput,
      ),
    );

    // --- real provider sync would run here, paginating with
    // job.lastCheckpoint and calling services/email/email-import-service.ts
    // ::recordEmail (or services/banks/bank-sync-service.ts for bank
    // providers) per message/transaction. Deferred — see this file's
    // header comment. ---

    const completedAt = new Date();
    await step.run("record-completed", () =>
      syncJobService.recordSyncJob(
        organizationId,
        { ...job, status: "completed", completedAt: completedAt.toISOString(), duration: completedAt.getTime() - startedAt.getTime() },
        providerCategory as ProviderCategoryInput,
      ),
    );

    await dispatch(
      "ledger/sync.completed",
      { organizationId, correlationId, syncJobId: job.id, itemsImported: 0, itemsSkipped: 0, duplicates: 0 },
      { id: buildKey("sync-completed", job.id) },
    );

    return { syncJobId: job.id, itemsImported: 0 };
  },
);
