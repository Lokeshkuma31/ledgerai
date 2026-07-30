/**
 * Email Intelligence Framework -> Unified Synchronization Engine adapter.
 * Wraps every registered EmailProvider (Gmail, and any future Outlook/Yahoo
 * provider) as a SyncProvider so it synchronizes through the central
 * engine's queue/scheduler/history instead of only through its own
 * dashboard-triggered path. Every bit of actual fetch, classification,
 * extraction, and duplicate detection is still delegated to
 * lib/email/engine.ts's existing runEmailSync() — this file only
 * translates between the two interfaces, mirroring lib/banks/syncAdapter.ts.
 */
import "@/plugins/gmail/plugin"; // ensures the Gmail provider (and its own Feed/Index/Coach contributors) exist first
import { runEmailSync } from "@/lib/email/engine";
import { getAllEmailProviderRecords, getEmailProviderRecord, getLatestImportRun } from "@/lib/email/registry";
import type { EmailSyncType } from "@/lib/email/types";
import { registerSyncProvider } from "@/lib/sync/registry";
import type {
  SyncCursor,
  SyncExecutionInput,
  SyncExecutionResult,
  SyncJobType,
  SyncProvider,
  SyncProviderHealthSnapshot,
} from "@/lib/sync/types";

/** The Email Intelligence Framework has no partial-batch resume concept —
 * a "resume"/"retry" job simply runs the same incremental fetch a
 * scheduled/manual one would; pipeline.ts's own duplicate detection makes
 * re-running safe either way. */
const JOB_TYPE_TO_EMAIL_SYNC_TYPE: Record<SyncJobType, EmailSyncType> = {
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

class EmailSyncProvider implements SyncProvider {
  readonly category = "email" as const;
  readonly supportsIncremental = true;
  readonly recommendedSchedule = "15min" as const;

  constructor(
    readonly id: string,
    readonly name: string,
  ) {}

  getCursor(): SyncCursor | null {
    return toCursor(getLatestImportRun(this.id)?.completedAt);
  }

  async sync(input: SyncExecutionInput): Promise<SyncExecutionResult> {
    const nowIso = new Date().toISOString();
    const run = await runEmailSync(this.id, JOB_TYPE_TO_EMAIL_SYNC_TYPE[input.mode]);

    return {
      itemsDiscovered: run.emailsFetched,
      itemsImported: run.transactionsCreated,
      itemsSkipped: run.emailsFetched - run.financialEmailsClassified,
      duplicates: run.duplicatesDetected,
      errors: run.errors.map((e) => ({ message: e.message, at: run.completedAt ?? nowIso })),
      warnings: [],
      nextCursor: toCursor(run.completedAt),
      checkpoint: null,
      metadata: {
        financialEmailsClassified: run.financialEmailsClassified,
        transactionsMatched: run.transactionsMatched,
        syncType: run.syncType,
      },
    };
  }

  async health(): Promise<SyncProviderHealthSnapshot> {
    const record = getEmailProviderRecord(this.id);
    if (!record) {
      return { status: "offline", message: "Provider is no longer installed.", checkedAt: new Date().toISOString() };
    }
    const status: SyncProviderHealthSnapshot["status"] =
      record.health.status === "healthy"
        ? "healthy"
        : record.health.status === "warning" || record.health.status === "syncing"
          ? "degraded"
          : "offline";
    return { status, message: record.health.message, checkedAt: record.health.checkedAt };
  }
}

function registerAllEmailSyncProviders(): void {
  for (const record of getAllEmailProviderRecords()) {
    registerSyncProvider(new EmailSyncProvider(record.id, record.name));
  }
}

registerAllEmailSyncProviders();
