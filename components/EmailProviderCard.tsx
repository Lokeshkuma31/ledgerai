"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ConnectorHealthBadge from "@/components/ConnectorHealthBadge";
import EmailImportHistory from "@/components/EmailImportHistory";
import type { EmailImportRun, EmailProviderRecord } from "@/lib/email/types";

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
    <Card size="sm" className="hover:ring-primary/30 transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col">
          <CardTitle className="text-base">{record.name}</CardTitle>
          <span className="text-muted-foreground text-xs">v{record.version}</span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <ConnectorHealthBadge status={record.health.status} />
          <Badge variant={record.enabled ? "success" : "secondary"}>
            {record.enabled ? "Enabled" : "Disabled"}
          </Badge>
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
