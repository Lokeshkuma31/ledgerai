"use client";

import ComparisonSelector from "./ComparisonSelector";
import TimeRangeSelector from "./TimeRangeSelector";
import type { ComparisonValue, TimeRangeValue } from "@/lib/visualization/types";

export default function ChartFilters({
  range,
  onRangeChange,
  comparison,
  onComparisonChange,
}: {
  range: TimeRangeValue;
  onRangeChange: (value: TimeRangeValue) => void;
  comparison: ComparisonValue;
  onComparisonChange: (value: ComparisonValue) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TimeRangeSelector value={range} onChange={onRangeChange} />
      <ComparisonSelector value={comparison} onChange={onComparisonChange} />
    </div>
  );
}
