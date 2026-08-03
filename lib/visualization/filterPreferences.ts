import type { ComparisonMode, TimeRange } from "./types";

const STORAGE_KEY = "ledgerai:analytics-filters";

export interface AnalyticsFilterPreferences {
  range: TimeRange;
  comparisonMode: ComparisonMode;
}

const DEFAULT_PREFERENCES: AnalyticsFilterPreferences = {
  range: "30d",
  comparisonMode: "previous-period",
};

/**
 * Mirrors lib/coach/pinnedInsights.ts's read/write shape: a small,
 * standalone localStorage registry, its own storage key, guarded for SSR
 * and corrupt JSON.
 */
export function getFilterPreferences(): AnalyticsFilterPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_PREFERENCES;
    return {
      range: parsed.range ?? DEFAULT_PREFERENCES.range,
      comparisonMode: parsed.comparisonMode ?? DEFAULT_PREFERENCES.comparisonMode,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveFilterPreferences(preferences: AnalyticsFilterPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
