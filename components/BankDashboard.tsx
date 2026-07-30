"use client";

// Side-effect import: registers the four demo connectors with
// lib/banks/registry.ts. Nothing else in the app currently imports
// providers.ts, so this dashboard is what makes them show up at all —
// the same role AddExpenseDialog.tsx's `import { sourceRegistry } from
// "@/lib/sources"` plays for the Transaction Source Framework.
import "@/lib/banks/providers";
// Same reason as above: registers the Account Aggregator plugin's
// connector directly, so it shows up here even if /plugins or /dashboard
// (which would otherwise register it via loadPlugins()) hasn't loaded yet
// this session.
import "@/plugins/account-aggregator/connector";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import BankCard from "@/components/BankCard";
import { checkConnectorHealth } from "@/lib/banks/health";
import {
  getAccountsForConnector,
  getAllConnectorRecords,
  getConnector,
  setConnectorEnabled,
} from "@/lib/banks/registry";
import { getSyncHistory, getTransactionIdsForAccount, retryFailedSync, runSync } from "@/lib/banks/sync-engine";
import { getTransactions } from "@/lib/storage";
import type { BankAccount, ConnectorRecord, SyncRun } from "@/lib/banks/types";
import type { Transaction } from "@/types/transaction";

export default function BankDashboard() {
  const [records, setRecords] = useState<ConnectorRecord[]>([]);
  const [accountsByConnector, setAccountsByConnector] = useState<Map<string, BankAccount[]>>(new Map());
  const [historyByConnector, setHistoryByConnector] = useState<Map<string, SyncRun[]>>(new Map());
  const [transactionsByAccount, setTransactionsByAccount] = useState<Map<string, Transaction[]>>(new Map());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    const nextRecords = getAllConnectorRecords();
    setRecords(nextRecords);

    const accounts = new Map<string, BankAccount[]>();
    const history = new Map<string, SyncRun[]>();
    for (const record of nextRecords) {
      accounts.set(record.id, getAccountsForConnector(record.id));
      history.set(record.id, getSyncHistory(record.id));
    }
    setAccountsByConnector(accounts);
    setHistoryByConnector(history);

    const allTransactions = getTransactions();
    const byAccount = new Map<string, Transaction[]>();
    for (const accountList of accounts.values()) {
      for (const account of accountList) {
        const ids = new Set(getTransactionIdsForAccount(account.id));
        byAccount.set(
          account.id,
          allTransactions.filter((t) => ids.has(t.id)),
        );
      }
    }
    setTransactionsByAccount(byAccount);
  }

  // Registry state lives in localStorage, which doesn't exist during
  // server rendering — loading it here (rather than in useState
  // initializers) avoids a hydration mismatch, the same fix the Android
  // SMS plugin's dashboard needed. Health is otherwise only recorded as a
  // side effect of a sync, so a connector that's never been synced would
  // show a stale "not yet checked" badge forever without an explicit
  // check here.
  useEffect(() => {
    refresh();
    Promise.all(getAllConnectorRecords().map((record) => checkConnectorHealth(record.id))).then(refresh);
  }, []);

  async function withBusy(id: string, action: () => Promise<void>) {
    setError(null);
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      refresh();
    }
  }

  function handleConnect(id: string) {
    void withBusy(id, async () => {
      const connector = getConnector(id);
      if (!connector) throw new Error(`Connector "${id}" is not installed.`);
      await connector.authenticate();
      await runSync(id, "full");
    });
  }

  function handleDisconnect(id: string) {
    void withBusy(id, async () => {
      const connector = getConnector(id);
      if (connector) await connector.disconnect();
    });
  }

  function handleToggleEnabled(record: ConnectorRecord) {
    void withBusy(record.id, async () => {
      setConnectorEnabled(record.id, !record.enabled);
    });
  }

  function handleRetry(id: string) {
    void withBusy(id, async () => {
      await retryFailedSync(id);
    });
  }

  if (records.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">No bank connectors installed yet.</p>
        </CardContent>
      </Card>
    );
  }

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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {records.map((record) => (
          <BankCard
            key={record.id}
            record={record}
            accounts={accountsByConnector.get(record.id) ?? []}
            syncRuns={historyByConnector.get(record.id) ?? []}
            transactionsByAccount={transactionsByAccount}
            busy={busyIds.has(record.id)}
            onConnect={() => handleConnect(record.id)}
            onDisconnect={() => handleDisconnect(record.id)}
            onToggleEnabled={() => handleToggleEnabled(record)}
            onRetry={() => handleRetry(record.id)}
            onSynced={refresh}
          />
        ))}
      </div>
    </div>
  );
}
