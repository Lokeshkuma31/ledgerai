/**
 * Android SMS & Notification Source -> Unified Synchronization Engine
 * adapter. This plugin has no incremental cursor or scheduled-fetch
 * concept of its own (it works over a fixed mock message batch) — every
 * sync mode simply re-scans the same batch and imports whatever's "Ready"
 * and not already-imported, delegating all parsing/normalizing/duplicate
 * detection to this plugin's existing scanMessages()/importSelected(),
 * exactly the same adapter role lib/banks/syncAdapter.ts and
 * lib/email/syncAdapter.ts play for their own frameworks.
 */
import "@/plugins/android-sms/plugin"; // ensures the plugin's own Feed/Index/Coach contributors exist first
import { androidSmsPlugin, buildPreviewRows, getImportSummary, importSelected } from "@/plugins/android-sms/plugin";
import { registerSyncProvider } from "@/lib/sync/registry";
import type { SyncCursor, SyncExecutionResult, SyncProvider, SyncProviderHealthSnapshot } from "@/lib/sync/types";

const PROVIDER_ID = "android-sms";

class AndroidSmsSyncProvider implements SyncProvider {
  readonly id = PROVIDER_ID;
  readonly name = "Android SMS & Notification Source";
  readonly category = "sms" as const;
  readonly supportsIncremental = false;
  readonly recommendedSchedule = "manual" as const;

  getCursor(): SyncCursor | null {
    const lastImportAt = getImportSummary().lastImportAt;
    return lastImportAt ? { value: lastImportAt, updatedAt: lastImportAt } : null;
  }

  async sync(): Promise<SyncExecutionResult> {
    const nowIso = new Date().toISOString();
    if (!androidSmsPlugin.enabled) {
      return {
        itemsDiscovered: 0,
        itemsImported: 0,
        itemsSkipped: 0,
        duplicates: 0,
        errors: [{ message: "Android SMS & Notification Source is disabled.", at: nowIso }],
        warnings: [],
        nextCursor: this.getCursor(),
        checkpoint: null,
      };
    }

    const rows = buildPreviewRows();
    const summary = await importSelected(rows);

    return {
      itemsDiscovered: summary.totalMessages,
      itemsImported: summary.importedCount,
      itemsSkipped: summary.skippedCount,
      duplicates: summary.duplicateCount,
      errors:
        summary.failedCount > 0
          ? [{ message: `${summary.failedCount} message(s) failed to parse.`, at: summary.lastImportAt ?? nowIso }]
          : [],
      warnings: [],
      nextCursor: summary.lastImportAt ? { value: summary.lastImportAt, updatedAt: summary.lastImportAt } : null,
      checkpoint: null,
    };
  }

  async health(): Promise<SyncProviderHealthSnapshot> {
    const health = await androidSmsPlugin.health();
    const status: SyncProviderHealthSnapshot["status"] =
      health.status === "healthy" ? "healthy" : health.status === "warning" ? "degraded" : "offline";
    return { status, message: health.message, checkedAt: health.checkedAt };
  }
}

registerSyncProvider(new AndroidSmsSyncProvider());
