"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import EmailImportHistory from "@/components/EmailImportHistory";
import type { EmailImportRun, EmailProviderRecord } from "@/lib/email/types";

const HEALTH_STYLES: Record<EmailProviderRecord["health"]["status"], string> = {
  healthy: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  syncing: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  disconnected: "bg-muted text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
  disabled: "bg-muted text-muted-foreground",
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function EmailProviderCard({
  record,
  history,
  busy,
  onConnect,
  onDisconnect,
  onSync,
  onToggleEnabled,
}: {
  record: EmailProviderRecord;
  history: EmailImportRun[];
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
  onToggleEnabled: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const connected = record.connection === "connected";

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col">
          <CardTitle className="text-base">{record.name}</CardTitle>
          <span className="text-muted-foreground text-xs">v{record.version}</span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${HEALTH_STYLES[record.health.status]}`}>{record.health.status}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${
              record.enabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
            }`}
          >
            {record.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground text-xs">{record.metadata.description}</p>
        <p className="text-muted-foreground text-xs">
          Last sync: {formatTimestamp(record.lastSync)} · Connection: <span className="capitalize">{record.connection}</span>
        </p>
        <p className="text-muted-foreground text-xs">{record.health.message}</p>

        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <Button size="xs" onClick={onConnect} disabled={busy || !record.enabled}>
              Connect
            </Button>
          ) : (
            <>
              <Button size="xs" variant="outline" onClick={onSync} disabled={busy || !record.enabled}>
                Sync Now
              </Button>
              <Button size="xs" variant="outline" onClick={onDisconnect} disabled={busy}>
                Disconnect
              </Button>
            </>
          )}
          <Button size="xs" variant="outline" onClick={onToggleEnabled} disabled={busy}>
            {record.enabled ? "Disable" : "Enable"}
          </Button>
          {history.length > 0 && (
            <Button size="xs" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? "Hide Import History" : "Import History"}
            </Button>
          )}
        </div>

        {showHistory && <EmailImportHistory runs={history} />}
      </CardContent>
    </Card>
  );
}
