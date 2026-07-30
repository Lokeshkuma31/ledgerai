"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getProviderSchedule, getSyncJobsByProvider } from "@/lib/sync/engine";
import { SYNC_SCHEDULE_FREQUENCIES, type SyncProvider, type SyncScheduleFrequency } from "@/lib/sync/types";

const FREQUENCY_LABELS: Record<SyncScheduleFrequency, string> = {
  manual: "Manual",
  "15min": "Every 15 Minutes",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  disabled: "Disabled",
};

function formatNextRun(iso: string | null): string {
  if (!iso) return "not scheduled";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Per-provider schedule settings — "Support: Manual, Every 15 minutes,
 * Hourly, Daily, Weekly, Disabled. Allow providers to define recommended
 * schedules." from the spec. Reads current state itself (schedule choice
 * + next run) rather than through props, the same self-contained pattern
 * WorkflowList's toggle buttons use. */
export default function ScheduleEditor({
  providers,
  onChange,
}: {
  providers: SyncProvider[];
  onChange: (providerId: string, frequency: SyncScheduleFrequency) => void;
}) {
  if (providers.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Schedule Settings</h2>
      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          {providers.map((provider) => {
            const lastRunAt = getSyncJobsByProvider(provider.id).find((job) => job.completedAt !== null)?.completedAt ?? null;
            const schedule = getProviderSchedule(provider.id, lastRunAt);
            return (
              <div key={provider.id} className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{provider.name}</span>
                  <span className="text-muted-foreground text-xs">
                    Recommended: {FREQUENCY_LABELS[provider.recommendedSchedule]} · Next run: {formatNextRun(schedule.nextRunAt)}
                  </span>
                </div>
                <Select
                  value={schedule.frequency}
                  onValueChange={(value) => value && onChange(provider.id, value as SyncScheduleFrequency)}
                >
                  <SelectTrigger size="sm" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SYNC_SCHEDULE_FREQUENCIES.map((frequency) => (
                      <SelectItem key={frequency} value={frequency}>
                        {FREQUENCY_LABELS[frequency]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
