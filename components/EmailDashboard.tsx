"use client";

// Side-effect import: registers the Gmail provider with lib/email/registry.ts,
// so this dashboard works even if no other page has loaded it this session —
// mirrors components/BankDashboard.tsx's import of lib/banks/providers.
import "@/plugins/gmail/plugin";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import EmailProviderCard from "@/components/EmailProviderCard";
import EmailPreview from "@/components/EmailPreview";
import EmailStatistics from "@/components/EmailStatistics";
import { editEmailFields, importEmail, rejectEmail, runEmailSync, skipEmail } from "@/lib/email/engine";
import {
  computeEmailStatistics,
  getAllEmailProviderRecords,
  getAllEmailProviders,
  getAllEmails,
  getEmailProvider,
  getImportHistory,
  recordProviderHealth,
  setEmailProviderEnabled,
} from "@/lib/email/registry";
import type { EmailImportRun, EmailProviderRecord, EmailRecord, EmailStatistics as Stats, ExtractedEmailFields } from "@/lib/email/types";

export default function EmailDashboard() {
  const [providers, setProviders] = useState<EmailProviderRecord[]>([]);
  const [historyByProvider, setHistoryByProvider] = useState<Map<string, EmailImportRun[]>>(new Map());
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    const nextProviders = getAllEmailProviderRecords();
    setProviders(nextProviders);

    const history = new Map<string, EmailImportRun[]>();
    for (const record of nextProviders) {
      history.set(record.id, getImportHistory(record.id));
    }
    setHistoryByProvider(history);

    setEmails(getAllEmails());
    setStats(computeEmailStatistics());
  }

  // localStorage-backed state doesn't exist during server rendering —
  // loading it here (not in useState initializers) avoids a hydration
  // mismatch, the same fix every other plugin dashboard in this app needed.
  useEffect(() => {
    refresh();
    Promise.all(
      getAllEmailProviders().map(async (provider) => {
        try {
          recordProviderHealth(provider.id, await provider.health());
        } catch {
          // A provider that can't report health yet is left at its
          // persisted default ("disconnected") — refresh() below still
          // reflects accurate current state either way.
        }
      }),
    ).then(refresh);
  }, []);

  async function withBusy(id: string, action: () => unknown) {
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

  function handleConnect(providerId: string) {
    void withBusy(providerId, async () => {
      const provider = getEmailProvider(providerId);
      if (!provider) throw new Error(`Provider "${providerId}" is not installed.`);
      await provider.connect();
      await runEmailSync(providerId, "full");
    });
  }

  function handleDisconnect(providerId: string) {
    void withBusy(providerId, async () => {
      await getEmailProvider(providerId)?.disconnect();
    });
  }

  function handleSync(providerId: string) {
    void withBusy(providerId, () => runEmailSync(providerId, "manual"));
  }

  function handleToggleEnabled(record: EmailProviderRecord) {
    void withBusy(record.id, () => setEmailProviderEnabled(record.id, !record.enabled));
  }

  const pending = emails.filter((e) => e.status === "processed" || e.status === "duplicate");

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

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Connected Providers</span>
        {providers.length === 0 ? (
          <Card size="sm">
            <CardContent>
              <p className="text-muted-foreground text-sm">No email providers installed yet.</p>
            </CardContent>
          </Card>
        ) : (
          providers.map((record) => (
            <EmailProviderCard
              key={record.id}
              record={record}
              history={historyByProvider.get(record.id) ?? []}
              busy={busyIds.has(record.id)}
              onConnect={() => handleConnect(record.id)}
              onDisconnect={() => handleDisconnect(record.id)}
              onSync={() => handleSync(record.id)}
              onToggleEnabled={() => handleToggleEnabled(record)}
            />
          ))
        )}
      </div>

      {stats && <EmailStatistics stats={stats} />}

      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Pending Imports</span>
          {pending.map((record) => (
            <EmailPreview
              key={record.id}
              record={record}
              busy={busyIds.has(record.id)}
              onImport={(force) => void withBusy(record.id, () => importEmail(record.id, { force }))}
              onSkip={() => void withBusy(record.id, () => skipEmail(record.id))}
              onReject={() => void withBusy(record.id, () => rejectEmail(record.id))}
              onSaveEdits={(patch: Partial<ExtractedEmailFields>) => void withBusy(record.id, () => editEmailFields(record.id, patch))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
