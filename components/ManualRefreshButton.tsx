"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { manualRefresh } from "@/plugins/account-aggregator/sync";

/** Always runs a "manual" sync through sync.ts's manualRefresh(), which
 * itself only calls lib/banks/sync-engine.ts's runSync() — this button
 * never bypasses the Bank Sync Engine. Failures are reflected via
 * onRefreshed() re-reading state (including a failed SyncRun in history)
 * rather than thrown here. */
export default function ManualRefreshButton({ onRefreshed, disabled }: { onRefreshed: () => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await manualRefresh();
    } catch {
      // Nothing further to record — onRefreshed() below re-reads state.
    } finally {
      setBusy(false);
      onRefreshed();
    }
  }

  return (
    <Button size="xs" onClick={handleClick} disabled={busy || disabled}>
      {busy ? "Refreshing…" : "Manual Refresh"}
    </Button>
  );
}
