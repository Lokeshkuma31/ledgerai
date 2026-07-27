/**
 * Scheduled Sync — pure TypeScript, no React, no real timer/cron (this
 * milestone adds no background services). Owns exactly one decision:
 * given a connector's schedule config and when it last synced, is it due
 * for a scheduled sync right now? Something else (a workflow trigger, the
 * dashboard, a test) calls getConnectorsDueForSync(now) and actually
 * invokes sync-engine.ts for whichever connectors it returns.
 */
import { getAllConnectorRecords } from "@/lib/banks/registry";
import type { SyncScheduleConfig } from "@/lib/banks/types";

const SCHEDULE_KEY = "ledgerai:banks:schedule";

export const DEFAULT_SCHEDULE: SyncScheduleConfig = {
  enabled: false,
  intervalMinutes: 60,
};

type ScheduleMap = Record<string, SyncScheduleConfig>;

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

export function getSyncSchedule(connectorId: string): SyncScheduleConfig {
  return readSchedules()[connectorId] ?? DEFAULT_SCHEDULE;
}

export function setSyncSchedule(connectorId: string, config: SyncScheduleConfig): SyncScheduleConfig {
  const schedules = readSchedules();
  schedules[connectorId] = config;
  writeSchedules(schedules);
  return config;
}

/** A connector with no prior sync is always due (nothing to wait out
 * yet); otherwise due once intervalMinutes has elapsed since lastSync. */
export function isDueForSync(lastSync: string | null, schedule: SyncScheduleConfig, now: Date): boolean {
  if (!schedule.enabled) return false;
  if (!lastSync) return true;
  const elapsedMinutes = (now.getTime() - new Date(lastSync).getTime()) / 60_000;
  return elapsedMinutes >= schedule.intervalMinutes;
}

/** Every enabled, schedule-enabled connector that's due for a sync right
 * now — the caller (a workflow trigger, a "Run Scheduled Syncs" action)
 * decides what to do with this list; the scheduler itself never calls
 * sync-engine.ts, keeping "decide what's due" and "actually sync"
 * separate the same way lib/policy's scheduler.ts only picks a
 * ScheduleType and never sends anything. */
export function getConnectorsDueForSync(now: Date = new Date()): string[] {
  return getAllConnectorRecords()
    .filter((record) => record.enabled)
    .filter((record) => isDueForSync(record.lastSync, getSyncSchedule(record.id), now))
    .map((record) => record.id);
}
