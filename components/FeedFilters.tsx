"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FEED_SEVERITIES, FEED_SOURCE_ENGINES } from "@/types/feed";
import type { FeedFilterOptions, FeedSeverity, FeedSourceEngine } from "@/types/feed";

const ALL = "all";

export type FeedTimeRange = "all" | "today" | "week" | "month";

export interface FeedFilterState {
  severity: FeedSeverity | "all";
  sourceEngine: FeedSourceEngine | "all";
  priorityMin: string;
  merchant: string;
  category: string;
  timeRange: FeedTimeRange;
  unreadOnly: boolean;
  pinnedOnly: boolean;
}

export function emptyFeedFilterState(): FeedFilterState {
  return {
    severity: "all",
    sourceEngine: "all",
    priorityMin: "0",
    merchant: "",
    category: "",
    timeRange: "all",
    unreadOnly: false,
    pinnedOnly: false,
  };
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Translates the UI's local filter state (Select-friendly strings, "all" sentinels)
 * into the pure FeedFilterOptions lib/feed/filters.ts actually consumes. */
export function toFeedFilterOptions(state: FeedFilterState, now: Date = new Date()): FeedFilterOptions {
  const options: FeedFilterOptions = {};
  if (state.severity !== ALL) options.severities = [state.severity];
  if (state.sourceEngine !== ALL) options.sourceEngines = [state.sourceEngine];

  const priorityMin = Number(state.priorityMin);
  if (priorityMin > 0) options.priorityMin = priorityMin;

  if (state.merchant.trim()) options.merchant = state.merchant.trim();
  if (state.category.trim()) options.category = state.category.trim();
  if (state.unreadOnly) options.unreadOnly = true;
  if (state.pinnedOnly) options.pinnedOnly = true;

  if (state.timeRange === "today") {
    options.startDate = formatDate(now);
    options.endDate = formatDate(now);
  } else if (state.timeRange === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    options.startDate = formatDate(start);
    options.endDate = formatDate(now);
  } else if (state.timeRange === "month") {
    options.startDate = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    options.endDate = formatDate(now);
  }

  return options;
}

const SEVERITY_LABELS: Record<FeedSeverity, string> = {
  positive: "Positive",
  info: "Info",
  warning: "Warning",
  important: "Important",
  critical: "Critical",
};

const SOURCE_ENGINE_LABELS: Record<FeedSourceEngine, string> = {
  budget: "Budget Engine",
  events: "Events Engine",
  decision: "Decision Engine",
  recurring: "Recurring Engine",
  forecast: "Forecast Engine",
  merchant: "Merchant Graph",
  timeline: "Timeline Engine",
  insights: "Insights Engine",
  feed: "Feed Engine",
};

const PRIORITY_TIERS = [
  { value: "0", label: "Any Priority" },
  { value: "50", label: "Priority 50+" },
  { value: "70", label: "Priority 70+" },
  { value: "90", label: "Priority 90+" },
];

const TIME_RANGES: { value: FeedTimeRange; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

export default function FeedFilters({
  state,
  onChange,
}: {
  state: FeedFilterState;
  onChange: (next: FeedFilterState) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <Select
        value={state.severity}
        onValueChange={(value) => value && onChange({ ...state, severity: value as FeedSeverity | "all" })}
      >
        <SelectTrigger className="sm:w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Severities</SelectItem>
          {FEED_SEVERITIES.map((severity) => (
            <SelectItem key={severity} value={severity}>
              {SEVERITY_LABELS[severity]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={state.sourceEngine}
        onValueChange={(value) => value && onChange({ ...state, sourceEngine: value as FeedSourceEngine | "all" })}
      >
        <SelectTrigger className="sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Engines</SelectItem>
          {FEED_SOURCE_ENGINES.map((engine) => (
            <SelectItem key={engine} value={engine}>
              {SOURCE_ENGINE_LABELS[engine]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={state.priorityMin}
        onValueChange={(value) => value && onChange({ ...state, priorityMin: value })}
      >
        <SelectTrigger className="sm:w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRIORITY_TIERS.map((tier) => (
            <SelectItem key={tier.value} value={tier.value}>
              {tier.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={state.timeRange}
        onValueChange={(value) => value && onChange({ ...state, timeRange: value as FeedTimeRange })}
      >
        <SelectTrigger className="sm:w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIME_RANGES.map((range) => (
            <SelectItem key={range.value} value={range.value}>
              {range.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        placeholder="Merchant…"
        value={state.merchant}
        onChange={(e) => onChange({ ...state, merchant: e.target.value })}
        className="sm:max-w-40"
      />
      <Input
        placeholder="Category…"
        value={state.category}
        onChange={(e) => onChange({ ...state, category: e.target.value })}
        className="sm:max-w-40"
      />
      <button
        type="button"
        onClick={() => onChange({ ...state, unreadOnly: !state.unreadOnly })}
        className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
          state.unreadOnly
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:text-foreground"
        }`}
      >
        Unread
      </button>
      <button
        type="button"
        onClick={() => onChange({ ...state, pinnedOnly: !state.pinnedOnly })}
        className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
          state.pinnedOnly
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:text-foreground"
        }`}
      >
        Pinned
      </button>
    </div>
  );
}
