import { parseLocalDate } from "./engine";
import type { DateWindow } from "./types";
import type { FinancialEvent, FinancialEventSeverity, FinancialEventType } from "@/types/event";

export interface AnnotationMarker {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "YYYY-MM" — for aligning to month-bucketed charts like CashFlowSeriesChart. */
  month: string;
  label: string;
  severity: FinancialEventSeverity;
}

/**
 * Only the FinancialEventTypes that correspond to the brief's own example
 * annotation list (Salary Received, Large Purchase, Budget Exceeded,
 * Subscription Renewal, Forecast Change, New Merchant). Deliberately not
 * exhaustive over FinancialEventType — this is a thin projector, not a new
 * detector, so an event type with no obvious chart-axis label (e.g.
 * "weekend-spending") is simply not annotated rather than guessed at. Note
 * "Vacation Spending" has no corresponding FinancialEventType at all and so
 * can never appear here — see docs/analytics-visualization-spec.md.
 */
const EVENT_LABELS: Partial<Record<FinancialEventType, string>> = {
  "salary-received": "Salary",
  "large-expense": "Large expense",
  "budget-exceeded": "Budget exceeded",
  "subscription-renewing": "Subscription renewal",
  "forecast-risk-increased": "Forecast risk ↑",
  "new-merchant": "New merchant",
};

/**
 * Projects already-detected FinancialEvents (lib/events/engine.ts) onto a
 * chart's time axis — never re-detects anything itself. Recommendations get
 * their own dedicated view (EventsTimelineChart), not this projector, since
 * they don't carry a single canonical date the way events do.
 */
export function projectEventAnnotations(events: FinancialEvent[], window: DateWindow): AnnotationMarker[] {
  return events
    .filter((e) => EVENT_LABELS[e.type] !== undefined)
    .filter((e) => {
      const d = parseLocalDate(e.date);
      return d >= window.start && d <= window.end;
    })
    .map((e) => ({
      id: e.id,
      date: e.date,
      month: e.date.slice(0, 7),
      label: EVENT_LABELS[e.type]!,
      severity: e.severity,
    }));
}
