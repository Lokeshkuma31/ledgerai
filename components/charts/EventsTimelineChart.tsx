import { Badge } from "@/components/ui/badge";
import ChartCard from "./ChartCard";
import type { FinancialEvent, FinancialEventSeverity } from "@/types/event";
import type { Recommendation, RecommendationPriority } from "@/types/recommendation";

type BadgeVariant = "success" | "secondary" | "warning" | "info" | "destructive";

interface TimelineRow {
  id: string;
  date: string;
  title: string;
  description: string;
  variant: BadgeVariant;
  label: string;
}

const EVENT_SEVERITY_VARIANT: Record<FinancialEventSeverity, BadgeVariant> = {
  info: "secondary",
  warning: "warning",
  important: "info",
  critical: "destructive",
};

const RECOMMENDATION_PRIORITY_VARIANT: Record<RecommendationPriority, BadgeVariant> = {
  low: "secondary",
  medium: "info",
  high: "warning",
  critical: "destructive",
};

function fromEvents(events: FinancialEvent[]): TimelineRow[] {
  return events.map((e) => ({
    id: e.id,
    date: e.date,
    title: e.title,
    description: e.description,
    variant: EVENT_SEVERITY_VARIANT[e.severity],
    label: e.severity,
  }));
}

function fromRecommendations(recommendations: Recommendation[]): TimelineRow[] {
  return recommendations.map((r) => ({
    id: r.id,
    date: r.createdAt.slice(0, 10),
    title: r.title,
    description: r.description,
    variant: RECOMMENDATION_PRIORITY_VARIANT[r.priority],
    label: r.priority,
  }));
}

/**
 * Renders either FinancialEvent[] (lib/events/engine.ts) or Recommendation[]
 * (lib/decision/engine.ts — the typed recommendations, never the free-text
 * CoachOutput) as a chronological timeline. Collapses "Financial Events
 * Timeline" and "AI Recommendation Timeline" into one component via an
 * adapter, since both are just "dated items with a severity/priority tag."
 */
export default function EventsTimelineChart({
  events,
  recommendations,
  compact = false,
}: {
  events?: FinancialEvent[];
  recommendations?: Recommendation[];
  compact?: boolean;
}) {
  const rows = events ? fromEvents(events) : fromRecommendations(recommendations ?? []);
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  const visible = compact ? sorted.slice(0, 5) : sorted;
  const title = events ? "Financial Events Timeline" : "AI Recommendation Timeline";

  const list =
    visible.length === 0 ? (
      <p className="text-muted-foreground py-8 text-center text-sm">Nothing to show yet.</p>
    ) : (
      <div className="flex flex-col gap-2">
        {visible.map((row) => (
          <div key={row.id} className="border-border flex items-start justify-between gap-3 border-t py-2.5 first:border-t-0">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{row.title}</span>
              <span className="text-muted-foreground line-clamp-1 text-xs">{row.description}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-muted-foreground font-numeric text-xs">{row.date}</span>
              <Badge variant={row.variant}>{row.label}</Badge>
            </div>
          </div>
        ))}
      </div>
    );

  if (compact) return list;

  return (
    <ChartCard title={title} csvData={{ headers: ["Date", "Title", "Label"], rows: sorted.map((r) => [r.date, r.title, r.label]) }}>
      {list}
    </ChartCard>
  );
}
