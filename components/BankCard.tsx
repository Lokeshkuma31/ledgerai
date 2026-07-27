"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AccountCard from "@/components/AccountCard";
import ConnectorHealthBadge from "@/components/ConnectorHealthBadge";
import ManualSyncButton from "@/components/ManualSyncButton";
import SyncHistoryTable from "@/components/SyncHistoryTable";
import type { BankAccount, ConnectorRecord, SyncRun } from "@/lib/banks/types";
import type { Transaction } from "@/types/transaction";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function BankCard({
  record,
  accounts,
  syncRuns,
  transactionsByAccount,
  busy,
  onConnect,
  onDisconnect,
  onToggleEnabled,
  onRetry,
  onSynced,
}: {
  record: ConnectorRecord;
  accounts: BankAccount[];
  syncRuns: SyncRun[];
  transactionsByAccount: Map<string, Transaction[]>;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleEnabled: () => void;
  onRetry: () => void;
  onSynced: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const connected = record.connection === "connected";
  const latestFailed = syncRuns.length > 0 && syncRuns[syncRuns.length - 1].status === "failed";

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col">
          <CardTitle className="text-base">{record.institution}</CardTitle>
          <span className="text-muted-foreground text-xs">
            {record.country} · v{record.version}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <ConnectorHealthBadge status={record.health.status} />
          <span
            className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${
              record.enabled
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {record.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1">
          {record.supportedFeatures.map((feature) => (
            <span key={feature} className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs capitalize">
              {feature.replace(/-/g, " ")}
            </span>
          ))}
        </div>
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
              <ManualSyncButton connectorId={record.id} onSynced={onSynced} disabled={!record.enabled} />
              <Button size="xs" variant="outline" onClick={onDisconnect} disabled={busy}>
                Disconnect
              </Button>
            </>
          )}
          {latestFailed && (
            <Button size="xs" variant="outline" onClick={onRetry} disabled={busy}>
              Retry Sync
            </Button>
          )}
          <Button size="xs" variant="outline" onClick={onToggleEnabled} disabled={busy}>
            {record.enabled ? "Disable" : "Enable"}
          </Button>
          {syncRuns.length > 0 && (
            <Button size="xs" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? "Hide History" : "Sync History"}
            </Button>
          )}
        </div>

        {accounts.length > 0 && (
          <div className="flex flex-col gap-2">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                recentTransactions={transactionsByAccount.get(account.id) ?? []}
              />
            ))}
          </div>
        )}

        {showHistory && <SyncHistoryTable runs={syncRuns} />}
      </CardContent>
    </Card>
  );
}
