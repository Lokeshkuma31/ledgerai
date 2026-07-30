/**
 * Bank Connector Framework -> Unified Synchronization Engine adapter. Wraps
 * every registered BankConnector as a SyncProvider so it synchronizes
 * through the central engine's queue/scheduler/history instead of only
 * through its own dashboard-triggered path. Every bit of actual fetch,
 * duplicate detection, and conflict resolution is still delegated to
 * lib/banks/sync-engine.ts's existing runSync()/retryFailedSync() — this
 * file only translates between the two interfaces, the same adapter role
 * lib/plugins/sourceAdapter.ts plays for TransactionSource.
 */
import "@/lib/banks/providers"; // ensures the framework's connectors (and its own Feed/Index/Coach contributors) exist first
import { getAllConnectorRecords, getConnector } from "@/lib/banks/registry";
import { getLatestSyncRun, retryFailedSync as retryBankSync, runSync } from "@/lib/banks/sync-engine";
import type { SyncType } from "@/lib/banks/types";
import { registerSyncProvider } from "@/lib/sync/registry";
import type {
  SyncCursor,
  SyncExecutionInput,
  SyncExecutionResult,
  SyncJobType,
  SyncProvider,
  SyncProviderHealthSnapshot,
} from "@/lib/sync/types";

/** The Bank Connector Framework has no partial-batch resume concept — a
 * "resume" or "retry" job simply runs the same incremental sync a
 * scheduled/manual one would; lib/banks/sync-engine.ts's own duplicate
 * detection (externalId + fingerprint) makes re-running safe either way. */
const JOB_TYPE_TO_BANK_SYNC_TYPE: Record<SyncJobType, SyncType> = {
  initial: "full",
  incremental: "incremental",
  manual: "manual",
  scheduled: "scheduled",
  resume: "incremental",
  retry: "incremental",
};

function toCursor(lastRunAt: string | null | undefined): SyncCursor | null {
  return lastRunAt ? { value: lastRunAt, updatedAt: lastRunAt } : null;
}

class BankSyncProvider implements SyncProvider {
  readonly category = "bank" as const;
  readonly supportsIncremental = true;
  readonly recommendedSchedule = "hourly" as const;

  constructor(
    readonly id: string,
    readonly name: string,
  ) {}

  getCursor(): SyncCursor | null {
    return toCursor(getLatestSyncRun(this.id)?.completedAt);
  }

  async sync(input: SyncExecutionInput): Promise<SyncExecutionResult> {
    const nowIso = new Date().toISOString();
    const run =
      input.mode === "retry"
        ? await retryBankSync(this.id)
        : await runSync(this.id, JOB_TYPE_TO_BANK_SYNC_TYPE[input.mode]);

    if (!run) {
      return {
        itemsDiscovered: 0,
        itemsImported: 0,
        itemsSkipped: 0,
        duplicates: 0,
        errors: [{ message: "Nothing to retry — the last sync already succeeded.", at: nowIso }],
        warnings: [],
        nextCursor: this.getCursor(),
        checkpoint: null,
      };
    }

    return {
      itemsDiscovered: run.transactionsImported + run.transactionsUpdated + run.duplicatesIgnored,
      itemsImported: run.transactionsImported,
      itemsSkipped: 0,
      duplicates: run.duplicatesIgnored,
      errors: run.errors.map((e) => ({ message: e.message, at: run.completedAt ?? nowIso })),
      warnings: run.warnings.map((message) => ({ message, at: run.completedAt ?? nowIso })),
      nextCursor: toCursor(run.completedAt),
      checkpoint: null,
      metadata: { transactionsUpdated: run.transactionsUpdated, syncType: run.syncType },
    };
  }

  async health(): Promise<SyncProviderHealthSnapshot> {
    const connector = getConnector(this.id);
    if (!connector) {
      return { status: "offline", message: "Connector is no longer installed.", checkedAt: new Date().toISOString() };
    }
    const health = await connector.health();
    const status: SyncProviderHealthSnapshot["status"] =
      health.status === "healthy" || health.status === "syncing"
        ? "healthy"
        : health.status === "warning"
          ? "degraded"
          : health.status === "disabled"
            ? "offline"
            : "offline";
    return { status, message: health.message, checkedAt: health.checkedAt };
  }
}

function registerAllBankSyncProviders(): void {
  for (const record of getAllConnectorRecords()) {
    registerSyncProvider(new BankSyncProvider(record.id, record.institution));
  }
}

registerAllBankSyncProviders();
