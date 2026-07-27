"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import QuietHoursEditor from "@/components/QuietHoursEditor";
import { DEFAULT_PREFERENCES, getPreferences, updatePreferences } from "@/lib/policy/preferences";
import { NOTIFICATION_CHANNELS } from "@/types/policy";
import type { NotificationChannel, NotificationPreferences as Preferences } from "@/types/policy";

type CategoryKey =
  | "budgetAlerts"
  | "forecastAlerts"
  | "subscriptionAlerts"
  | "achievements"
  | "merchantInsights"
  | "weeklyDigest"
  | "monthlyDigest";

const CATEGORY_TOGGLES: { key: CategoryKey; label: string }[] = [
  { key: "budgetAlerts", label: "Budget Alerts" },
  { key: "forecastAlerts", label: "Forecast Alerts" },
  { key: "subscriptionAlerts", label: "Subscription Alerts" },
  { key: "achievements", label: "Achievements" },
  { key: "merchantInsights", label: "Merchant Insights" },
  { key: "weeklyDigest", label: "Weekly Digest" },
  { key: "monthlyDigest", label: "Monthly Digest" },
];

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  push: "Push",
  email: "Email",
  "dashboard-feed": "Dashboard Feed",
  "home-widget": "Home Widget",
  desktop: "Desktop",
  watch: "Watch",
  "voice-assistant": "Voice Assistant",
};

function toggleChannel(channels: NotificationChannel[], channel: NotificationChannel): NotificationChannel[] {
  return channels.includes(channel) ? channels.filter((c) => c !== channel) : [...channels, channel];
}

function pillClass(active: boolean): string {
  return `rounded-full px-2.5 py-1 text-xs transition-colors ${
    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
  }`;
}

/**
 * Reads/writes lib/policy/preferences.ts directly — this is the only place
 * user-facing preference edits happen; the Policy Engine only ever reads
 * the persisted result, never derives its own defaults at evaluation time.
 */
export default function NotificationPreferences({
  onChange,
}: {
  onChange?: (preferences: Preferences) => void;
}) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const loaded = getPreferences();
    setPreferences(loaded);
    onChange?.(loaded);
    // Only ever runs once, on mount, to hydrate from localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(patch: Partial<Preferences>) {
    const next = updatePreferences(patch);
    setPreferences(next);
    onChange?.(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label className="text-xs">Categories</Label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_TOGGLES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => apply({ [key]: !preferences[key] } as Partial<Preferences>)}
              className={pillClass(preferences[key])}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs">Preferred Channels</Label>
        <div className="flex flex-wrap gap-1.5">
          {NOTIFICATION_CHANNELS.map((channel) => (
            <button
              key={channel}
              type="button"
              onClick={() =>
                apply({ preferredChannels: toggleChannel(preferences.preferredChannels, channel) })
              }
              className={pillClass(preferences.preferredChannels.includes(channel))}
            >
              {CHANNEL_LABELS[channel]}
            </button>
          ))}
        </div>
      </div>

      <QuietHoursEditor value={preferences.quietHours} onChange={(quietHours) => apply({ quietHours })} />

      <div className="flex flex-col gap-1">
        <Label htmlFor="max-notifications-per-day" className="text-xs">
          Maximum Notifications Per Day
        </Label>
        <Input
          id="max-notifications-per-day"
          type="number"
          min={0}
          value={preferences.maxNotificationsPerDay}
          onChange={(e) => apply({ maxNotificationsPerDay: Math.max(0, Number(e.target.value) || 0) })}
          className="w-24"
        />
      </div>
    </div>
  );
}
