"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { TimeRange, TimeRangeValue } from "@/lib/visualization/types";

const RANGE_LABELS: Record<TimeRange, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "6m": "Last 6 months",
  "1y": "Last year",
  all: "All time",
  custom: "Custom range",
};

const RANGE_ORDER: TimeRange[] = [
  "today",
  "yesterday",
  "7d",
  "30d",
  "90d",
  "6m",
  "1y",
  "all",
  "custom",
];

export default function TimeRangeSelector({
  value,
  onChange,
}: {
  value: TimeRangeValue;
  onChange: (value: TimeRangeValue) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value.range}
        onValueChange={(range) => onChange({ ...value, range: range as TimeRange })}
      >
        <SelectTrigger aria-label="Time range" size="sm">
          <SelectValue placeholder="Time range" />
        </SelectTrigger>
        <SelectContent>
          {RANGE_ORDER.map((range) => (
            <SelectItem key={range} value={range}>
              {RANGE_LABELS[range]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.range === "custom" && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            aria-label="Custom range start"
            className="h-7 w-36 text-xs"
            value={value.start ?? ""}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input
            type="date"
            aria-label="Custom range end"
            className="h-7 w-36 text-xs"
            value={value.end ?? ""}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
