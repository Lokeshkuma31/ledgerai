/**
 * Scheduled Sync — pure TypeScript, no React, no real timer/cron (this
 * milestone adds no background services; see the "Do NOT Add" list).
 * Owns exactly one decision: given a provider's schedule frequency and
 * when it last completed, is it due for a scheduled sync right now?
 * Mirrors lib/banks/scheduler.ts's split almost exactly, generalized from
 * a per-connector interval to the spec's named frequencies. Something else
 * (lib/sync/engine.ts's startScheduledSyncs, the dashboard, a test) calls
 * getProvidersDueForSync(now) and actually enqueues a job for whichever
 * providers it returns — this module never calls the queue or executor
 * itself, keeping "decide what's due" and "actually sync" separate.
 */
import { getAllSyncProviders, getSyncProvider } from "@/lib/sync/registry";
import type { SyncProviderSchedule, SyncScheduleFrequency } from "@/lib/sync/types";

const SCHEDULE_KEY = "ledgerai:sync:schedules";

type ScheduleMap = Record<string, SyncScheduleFrequency>;

/** null means "never auto-runs" (manual/disabled); the sync minutes for
 * every other frequency the spec names. */
const FREQUENCY_MINUTES: Record<SyncScheduleFrequency, number | null> = {
  manual: null,
  "15min": 15,
  hourly: 60,
  daily: 60 * 24,
  weekly: 60 * 24 * 7,
  disabled: null,
};

function readSchedules(): ScheduleMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SCHEDULE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" ? (parsed as ScheduleMap) : {};
  } catch {
    return {};
  }
}

function writeSchedules(schedules: ScheduleMap): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedules));
}

/** Falls back to the provider's own recommendedSchedule when the user
 * hasn't chosen one explicitly — "Allow providers to define recommended
 * schedules" from the spec. */
export function getScheduleFrequency(providerId: string): SyncScheduleFrequency {
  const stored = readSchedules()[providerId];
  if (stored) return stored;
  return getSyncProvider(providerId)?.recommendedSchedule ?? "manual";
}

export function setScheduleFrequency(providerId: string, frequency: SyncScheduleFrequency): SyncScheduleFrequency {
  const schedules = readSchedules();
  schedules[providerId] = frequency;
  writeSchedules(schedules);
  return frequency;
}

function computeNextRunAt(lastRunAt: string | null, frequency: SyncScheduleFrequency, now: Date): string | null {
  const minutes = FREQUENCY_MINUTES[frequency];
  if (minutes === null) return null;
  if (!lastRunAt) return now.toISOString(); // never synced -> due immediately
  return new Date(new Date(lastRunAt).getTime() + minutes * 60_000).toISOString();
}

export function isDueForSync(
  lastRunAt: string | null,
  frequency: SyncScheduleFrequency,
  now: Date = new Date(),
): boolean {
  const nextRunAt = computeNextRunAt(lastRunAt, frequency, now);
  return nextRunAt !== null && new Date(nextRunAt).getTime() <= now.getTime();
}

export function getProviderSchedule(
  providerId: string,
  lastRunAt: string | null,
  now: Date = new Date(),
): SyncProviderSchedule {
  const frequency = getScheduleFrequency(providerId);
  return { frequency, nextRunAt: computeNextRunAt(lastRunAt, frequency, now) };
}

/** Every registered provider that's due for a scheduled sync right now.
 * `lastRunAtByProvider` is supplied by the caller (usually read from
 * lib/sync/history.ts's getLatestSyncJob) rather than read directly here,
 * so this module has no dependency on history.ts and stays independently
 * testable with synthetic timestamps. */
export function getProvidersDueForSync(
  lastRunAtByProvider: Record<string, string | null>,
  now: Date = new Date(),
): string[] {
  return getAllSyncProviders()
    .map((provider) => provider.id)
    .filter((id) => isDueForSync(lastRunAtByProvider[id] ?? null, getScheduleFrequency(id), now));
}
