"use client";

// Side-effect imports: register every provider with the Unified
// Synchronization Engine independent of whether /dashboard happened to
// load first in this session (registration is in-memory, not persisted) —
// mirrors components/BankDashboard.tsx's own direct import of
// "@/lib/banks/providers" for the same reason. Each adapter wraps an
// already-existing framework's real sync logic; importing the same module
// from multiple entry points is safe since ES modules only evaluate once.
import "@/lib/banks/syncAdapter";
import "@/lib/email/syncAdapter";
import "@/plugins/android-sms/syncAdapter";
import "@/lib/sync/engine";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ProviderHealthTable from "@/components/ProviderHealthTable";
import QueueMonitor from "@/components/QueueMonitor";
import ScheduleEditor from "@/components/ScheduleEditor";
import SyncHistory from "@/components/SyncHistory";
import SyncJobCard from "@/components/SyncJobCard";
import {
  cancelSync,
  getAllSyncProviders,
  getEngineHealth,
  getQueueSnapshot,
  getSyncJobsByProvider,
  pauseSync,
  resumeSync,
  retrySync,
  runScheduledSyncs,
  setScheduleFrequency,
  startSync,
} from "@/lib/sync/engine";
import type { SyncEngineHealth, SyncJob, SyncProvider, SyncQueueSnapshot, SyncScheduleFrequency } from "@/lib/sync/types";
import { isProviderSyncEnabled } from "@/lib/flags";

const POLL_INTERVAL_MS = 2000;

/**
 * Top-level orchestrator for /sync — every connected provider's most
 * recent job, live queue state, engine/provider health, schedule
 * settings, and full history, all through the Unified Synchronization
 * Engine's public API (lib/sync/engine.ts). No engine logic lives here;
 * this component only wires state to the buttons the spec's dashboard
 * section asks for (Manual Sync Buttons, Schedule Settings).
 */
export default function SyncDashboard() {
  const syncEnabled = isProviderSyncEnabled();
  const [providers, setProviders] = useState<SyncProvider[]>([]);
  const [queue, setQueue] = useState<SyncQueueSnapshot>({ queued: [], running: [], concurrencyLimit: 2 });
  const [health, setHealth] = useState<SyncEngineHealth | null>(null);
  const [jobsByProvider, setJobsByProvider] = useState<Record<string, SyncJob[]>>({});
  const [startingIds, setStartingIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const allProviders = getAllSyncProviders();
    setProviders(allProviders);
    setQueue(getQueueSnapshot());
    setHealth(await getEngineHealth());
    const jobs: Record<string, SyncJob[]> = {};
    for (const provider of allProviders) {
      jobs[provider.id] = getSyncJobsByProvider(provider.id);
    }
    setJobsByProvider(jobs);
  }, []);

  useEffect(() => {
    refresh();
    // Polling, not a background service: this interval only exists while
    // /sync is mounted, purely to reflect in-memory queue/job state
    // (queued/running jobs aren't otherwise observable from React).
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleStart(provider: SyncProvider) {
    if (!syncEnabled) return;
    setStartingIds((prev) => new Set(prev).add(provider.id));
    try {
      startSync(provider.id, "manual");
    } finally {
      await refresh();
      setStartingIds((prev) => {
        const next = new Set(prev);
        next.delete(provider.id);
        return next;
      });
    }
  }

  async function handleRunScheduled() {
    runScheduledSyncs();
    await refresh();
  }

  async function handleRetry(providerId: string) {
    retrySync(providerId);
    await refresh();
  }

  async function handleResume(providerId: string) {
    resumeSync(providerId);
    await refresh();
  }

  async function handleCancel(jobId: string) {
    cancelSync(jobId);
    await refresh();
  }

  async function handlePause(jobId: string) {
    pauseSync(jobId);
    await refresh();
  }

  async function handleScheduleChange(providerId: string, frequency: SyncScheduleFrequency) {
    setScheduleFrequency(providerId, frequency);
    await refresh();
  }

  const allJobs = Object.values(jobsByProvider).flat();
  const latestJobFor = (providerId: string): SyncJob | undefined => {
    const jobs = jobsByProvider[providerId] ?? [];
    return [...jobs].sort((a, b) => b.queuedAt.localeCompare(a.queuedAt))[0];
  };

  return (
    <div className="flex flex-col gap-6">
      {!syncEnabled && (
        <Card role="status" className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="py-3 text-sm text-amber-700 dark:text-amber-300">
            Provider sync is temporarily disabled. Existing data is unaffected — this only pauses new syncs.
          </CardContent>
        </Card>
      )}

      {health && <ProviderHealthTable health={health} />}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Providers</h2>
          <Button variant="outline" size="xs" onClick={handleRunScheduled} disabled={!syncEnabled}>
            Run Due Schedules
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {providers.map((provider) => (
            <SyncJobCard
              key={provider.id}
              provider={provider}
              latestJob={latestJobFor(provider.id)}
              isStarting={startingIds.has(provider.id)}
              onStart={() => handleStart(provider)}
              onRetry={() => handleRetry(provider.id)}
              onResume={() => handleResume(provider.id)}
              onPause={handlePause}
              onCancel={handleCancel}
            />
          ))}
          {providers.length === 0 && (
            <Card>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  No providers are registered with the Sync Engine yet.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <QueueMonitor queue={queue} />
      <ScheduleEditor providers={providers} onChange={handleScheduleChange} />
      <SyncHistory jobs={allJobs} />
    </div>
  );
}
