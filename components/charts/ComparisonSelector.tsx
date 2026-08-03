"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ComparisonMode, ComparisonValue } from "@/lib/visualization/types";

const MODE_LABELS: Record<ComparisonMode, string> = {
  none: "No comparison",
  "previous-period": "Previous period",
  "previous-month": "Previous month",
  "previous-year": "Previous year",
  custom: "Custom",
};

const MODE_ORDER: ComparisonMode[] = [
  "none",
  "previous-period",
  "previous-month",
  "previous-year",
  "custom",
];

export default function ComparisonSelector({
  value,
  onChange,
}: {
  value: ComparisonValue;
  onChange: (value: ComparisonValue) => void;
}) {
  return (
    <Select
      value={value.mode}
      onValueChange={(mode) => onChange({ ...value, mode: mode as ComparisonMode })}
    >
      <SelectTrigger aria-label="Compare to" size="sm">
        <SelectValue placeholder="Compare to" />
      </SelectTrigger>
      <SelectContent>
        {MODE_ORDER.map((mode) => (
          <SelectItem key={mode} value={mode}>
            {MODE_LABELS[mode]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
