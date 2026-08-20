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
import { isProviderSyncEnabled } from "@/lib/flags";
import { mutex, globalConcurrency } from "@/lib/jobs/queue";
import * as syncJobService from "@/services/sync/sync-job-service";
import { capture } from "@/lib/observability/analytics";
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
    if (!isProviderSyncEnabled()) return { skipped: true, reason: "provider_sync_disabled" };
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
    capture("sync_started", organizationId, { provider, sync_type: "initial" });
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
    if (!isProviderSyncEnabled()) return { skipped: true, reason: "provider_sync_disabled" };
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

    try {
      // --- real provider sync would run here, paginating with
      // job.lastCheckpoint and calling services/email/email-import-service.ts
      // ::recordEmail (or services/banks/bank-sync-service.ts for bank
      // providers) per message/transaction. Deferred — see this file's
      // header comment. ---

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();
      await step.run("record-completed", () =>
        syncJobService.recordSyncJob(
          organizationId,
          { ...job, status: "completed", completedAt: completedAt.toISOString(), duration: durationMs },
          providerCategory as ProviderCategoryInput,
        ),
      );

      await dispatch(
        "ledger/sync.completed",
        { organizationId, correlationId, syncJobId: job.id, itemsImported: 0, itemsSkipped: 0, duplicates: 0 },
        { id: buildKey("sync-completed", job.id) },
      );
      capture("sync_completed", organizationId, { provider: providerId, sync_type: event.data.runType, duration_ms: durationMs, items_synced: 0 });

      return { syncJobId: job.id, itemsImported: 0 };
    } catch (error) {
      await dispatch(
        "ledger/sync.failed",
        { organizationId, correlationId, syncJobId: job.id, errorClass: "sync_execution_error", message: error instanceof Error ? error.message : "Unknown error" },
        { id: buildKey("sync-failed", job.id) },
      ).catch(() => undefined);
      capture("sync_failed", organizationId, { provider: providerId, sync_type: event.data.runType, failure_reason: error instanceof Error ? error.message : "unknown" });
      throw error;
    }
  },
);
