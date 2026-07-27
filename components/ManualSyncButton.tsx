"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { runSync } from "@/lib/banks/sync-engine";

/**
 * Always runs a "manual" sync — the Sync Engine's own Manual Sync path.
 * Failures (disabled connector, connector fetch error) are reported back
 * through onSynced() rather than thrown; the parent dashboard re-reads
 * connector/account/history state either way and reflects whatever
 * actually happened (including a failed SyncRun in history).
 */
export default function ManualSyncButton({
  connectorId,
  onSynced,
  disabled,
}: {
  connectorId: string;
  onSynced: () => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await runSync(connectorId, "manual");
    } catch {
      // A disabled/uninstalled connector throws before a SyncRun even
      // exists — nothing further to record; the dashboard refresh below
      // still shows accurate current state.
    } finally {
      setBusy(false);
      onSynced();
    }
  }

  return (
    <Button size="xs" variant="outline" onClick={handleClick} disabled={busy || disabled}>
      {busy ? "Syncing…" : "Sync Now"}
    </Button>
  );
}
