/**
 * Synchronization orchestration — thin wrappers scoped to this plugin's
 * connector id over lib/banks/sync-engine.ts, the Bank Sync Engine this
 * milestone requires every sync path to go through exclusively. This file
 * adds no ingestion/storage/workflow-trigger logic of its own beyond
 * firing the "sync-completed"/"sync-failed" Workflow Engine triggers the
 * spec asks for — everything else (duplicate detection, conflict
 * detection, sync history, retry) is the engine's own job, untouched.
 */
import { runWorkflowsForTrigger } from "@/lib/workflows/engine";
import { getLatestSyncRun, getSyncHistory, retryFailedSync, runSync } from "@/lib/banks/sync-engine";
import type { SyncRun } from "@/lib/banks/types";
import { ACCOUNT_AGGREGATOR_CONNECTOR_ID } from "@/plugins/account-aggregator/connector";

async function fireSyncTrigger(run: SyncRun): Promise<void> {
  const context = {
    connectorId: run.connectorId,
    syncRunId: run.id,
    syncType: run.syncType,
    transactionsImported: run.transactionsImported,
    transactionsUpdated: run.transactionsUpdated,
    duplicatesIgnored: run.duplicatesIgnored,
    errors: run.errors,
  };
  if (run.status === "failed") {
    await runWorkflowsForTrigger("sync-failed", context, new Date());
  } else {
    await runWorkflowsForTrigger("sync-completed", context, new Date());
  }
}

export async function runInitialSync(): Promise<SyncRun> {
  const run = await runSync(ACCOUNT_AGGREGATOR_CONNECTOR_ID, "full");
  await fireSyncTrigger(run);
  return run;
}

export async function runIncrementalSync(): Promise<SyncRun> {
  const run = await runSync(ACCOUNT_AGGREGATOR_CONNECTOR_ID, "incremental");
  await fireSyncTrigger(run);
  return run;
}

export async function manualRefresh(): Promise<SyncRun> {
  const run = await runSync(ACCOUNT_AGGREGATOR_CONNECTOR_ID, "manual");
  await fireSyncTrigger(run);
  return run;
}

export async function retry(): Promise<SyncRun | undefined> {
  const run = await retryFailedSync(ACCOUNT_AGGREGATOR_CONNECTOR_ID);
  if (run) await fireSyncTrigger(run);
  return run;
}

export function getHistory(): SyncRun[] {
  return getSyncHistory(ACCOUNT_AGGREGATOR_CONNECTOR_ID);
}

export function getLatest(): SyncRun | undefined {
  return getLatestSyncRun(ACCOUNT_AGGREGATOR_CONNECTOR_ID);
}
