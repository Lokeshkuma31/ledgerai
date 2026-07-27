"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { QuietHours } from "@/types/policy";

export default function QuietHoursEditor({
  value,
  onChange,
}: {
  value: QuietHours;
  onChange: (next: QuietHours) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Quiet Hours</Label>
        <button
          type="button"
          onClick={() => onChange({ ...value, enabled: !value.enabled })}
          className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
            value.enabled
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          {value.enabled ? "Enabled" : "Disabled"}
        </button>
      </div>
      {value.enabled && (
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="quiet-hours-start" className="text-xs">
              From
            </Label>
            <Input
              id="quiet-hours-start"
              type="time"
              value={value.start}
              onChange={(e) => onChange({ ...value, start: e.target.value })}
              className="w-28"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="quiet-hours-end" className="text-xs">
              To
            </Label>
            <Input
              id="quiet-hours-end"
              type="time"
              value={value.end}
              onChange={(e) => onChange({ ...value, end: e.target.value })}
              className="w-28"
            />
          </div>
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        Notifications during quiet hours are deferred until the window ends, rather than skipped.
      </p>
    </div>
  );
}
