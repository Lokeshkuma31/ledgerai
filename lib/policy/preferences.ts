import type { NotificationPreferences } from "@/types/policy";

const STORAGE_KEY = "ledgerai:policy:preferences";

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  budgetAlerts: true,
  forecastAlerts: true,
  subscriptionAlerts: true,
  achievements: true,
  merchantInsights: true,
  weeklyDigest: true,
  monthlyDigest: true,
  quietHours: { enabled: false, start: "22:00", end: "07:00" },
  preferredChannels: ["dashboard-feed", "push"],
  maxNotificationsPerDay: 10,
};

/** Read-only, defensive — falls back to defaults for anything missing or
 * malformed, so a partially-written or pre-milestone localStorage value
 * never breaks the engine. */
export function getPreferences(): NotificationPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_PREFERENCES;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      quietHours: { ...DEFAULT_PREFERENCES.quietHours, ...(parsed.quietHours ?? {}) },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: NotificationPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export function updatePreferences(patch: Partial<NotificationPreferences>): NotificationPreferences {
  const next = { ...getPreferences(), ...patch };
  savePreferences(next);
  return next;
}

export function resetPreferences(): NotificationPreferences {
  savePreferences(DEFAULT_PREFERENCES);
  return DEFAULT_PREFERENCES;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Handles the overnight-wraparound case (e.g. 22:00-07:00) by checking
 * whether `now` falls in the window either before or after midnight.
 */
export function isWithinQuietHours(preferences: NotificationPreferences, now: Date): boolean {
  if (!preferences.quietHours.enabled) return false;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(preferences.quietHours.start);
  const end = toMinutes(preferences.quietHours.end);

  if (start === end) return false;
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
}

/** The next moment quiet hours end from `now` — used to reschedule a
 * would-be-immediate notification until the window closes. */
export function quietHoursEndTime(preferences: NotificationPreferences, now: Date): Date {
  const [endHour, endMinute] = preferences.quietHours.end.split(":").map(Number);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, endMinute, 0);
  if (end.getTime() <= now.getTime()) end.setDate(end.getDate() + 1);
  return end;
}
