"use client";

// Side-effect import: registers this plugin's connector with
// lib/banks/registry.ts, the same reason BankDashboard.tsx imports
// lib/banks/providers directly — this page must work even if /plugins or
// /dashboard (which would otherwise register it via loadPlugins()) hasn't
// loaded this session.
import "@/plugins/account-aggregator/connector";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ConsentCard from "@/components/ConsentCard";
import ConsentTimeline from "@/components/ConsentTimeline";
import ConnectedAccounts from "@/components/ConnectedAccounts";
import ProviderHealth from "@/components/ProviderHealth";
import SyncStatus from "@/components/SyncStatus";
import ManualRefreshButton from "@/components/ManualRefreshButton";
import SyncHistoryTable from "@/components/SyncHistoryTable";
import { checkConnectorHealth } from "@/lib/banks/health";
import { getAccountsForConnector, getConnector, getConnectorRecord } from "@/lib/banks/registry";
import { getTransactionIdsForAccount } from "@/lib/banks/sync-engine";
import { getTransactions } from "@/lib/storage";
import { ACCOUNT_AGGREGATOR_CONNECTOR_ID } from "@/plugins/account-aggregator/connector";
import { getConsent, getConsentHistory } from "@/plugins/account-aggregator/consent";
import { getHistory, getLatest, retry, runInitialSync } from "@/plugins/account-aggregator/sync";
import type { BankAccount, ConnectorHealth, ConnectorRecord, SyncRun } from "@/lib/banks/types";
import type { Consent, ConsentTimelineEntry } from "@/plugins/account-aggregator/types";
import type { Transaction } from "@/types/transaction";

export default function AccountAggregatorDashboard() {
  const [record, setRecord] = useState<ConnectorRecord | null>(null);
  const [health, setHealth] = useState<ConnectorHealth | null>(null);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [consentHistory, setConsentHistory] = useState<ConsentTimelineEntry[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [syncHistory, setSyncHistory] = useState<SyncRun[]>([]);
  const [transactionsByAccount, setTransactionsByAccount] = useState<Map<string, Transaction[]>>(new Map());
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setRecord(getConnectorRecord(ACCOUNT_AGGREGATOR_CONNECTOR_ID) ?? null);
    setConsent(getConsent());
    setConsentHistory(getConsentHistory());
    const accts = getAccountsForConnector(ACCOUNT_AGGREGATOR_CONNECTOR_ID);
    setAccounts(accts);
    setSyncHistory(getHistory());

    const allTransactions = getTransactions();
    const byAccount = new Map<string, Transaction[]>();
    for (const account of accts) {
      const ids = new Set(getTransactionIdsForAccount(account.id));
      byAccount.set(account.id, allTransactions.filter((t) => ids.has(t.id)));
    }
    setTransactionsByAccount(byAccount);
  }

  // localStorage-backed state doesn't exist during server rendering —
  // loading here (not in useState initializers) avoids a hydration
  // mismatch, the same fix BankDashboard.tsx needed.
  useEffect(() => {
    refresh();
    checkConnectorHealth(ACCOUNT_AGGREGATOR_CONNECTOR_ID).then((h) => {
      setHealth(h);
      refresh();
    });
  }, []);

  async function withBusy(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
      refresh();
    }
  }

  function handleConnect() {
    void withBusy(async () => {
      const connector = getConnector(ACCOUNT_AGGREGATOR_CONNECTOR_ID);
      if (!connector) throw new Error("Account Aggregator connector is not installed.");
      await connector.authenticate();
      await runInitialSync();
    });
  }

  function handleDisconnect() {
    void withBusy(async () => {
      const connector = getConnector(ACCOUNT_AGGREGATOR_CONNECTOR_ID);
      if (connector) await connector.disconnect();
    });
  }

  function handleRetry() {
    void withBusy(async () => {
      await retry();
    });
  }

  const connected = record?.connection === "connected";
  const latestRun = syncHistory.length > 0 ? syncHistory[syncHistory.length - 1] : getLatest();
  const latestFailed = latestRun?.status === "failed";

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="ghost" size="xs" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!connected ? (
          <Button size="xs" onClick={handleConnect} disabled={busy}>
            Connect (Request Consent)
          </Button>
        ) : (
          <>
            <ManualRefreshButton onRefreshed={refresh} disabled={!record?.enabled} />
            <Button size="xs" variant="outline" onClick={handleDisconnect} disabled={busy}>
              Disconnect
            </Button>
          </>
        )}
        {latestFailed && (
          <Button size="xs" variant="outline" onClick={handleRetry} disabled={busy}>
            Retry Sync
          </Button>
        )}
        {syncHistory.length > 0 && (
          <Button size="xs" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Hide Sync History" : "Sync History"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ConsentCard consent={consent} />
        <ProviderHealth health={health} />
      </div>

      <SyncStatus latestRun={latestRun} />

      {!record && (
        <Card size="sm">
          <CardContent>
            <p className="text-muted-foreground text-sm">Account Aggregator connector is not installed.</p>
          </CardContent>
        </Card>
      )}

      <ConnectedAccounts accounts={accounts} transactionsByAccount={transactionsByAccount} />

      {showHistory && <SyncHistoryTable runs={syncHistory} />}

      <ConsentTimeline entries={consentHistory} />
    </div>
  );
}
