import { Card, CardContent } from "@/components/ui/card";
import type { FeedStatistics as FeedStatisticsData } from "@/types/feed";

function humanize(value: string): string {
  return value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default function FeedStatistics({ statistics }: { statistics: FeedStatisticsData }) {
  return (
    <Card size="sm">
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Unread" value={statistics.unreadCount} />
        <Stat label="Critical" value={statistics.criticalCount} />
        <Stat label="Pinned" value={statistics.pinnedCount} />
        <Stat label="Dismissed" value={statistics.dismissedCount} />
        <Stat label="Avg Daily Insights" value={statistics.averageDailyInsights} />
        <Stat
          label="Most Common"
          value={statistics.mostCommonType ? humanize(statistics.mostCommonType) : "—"}
        />
        <Stat
          label="Highest Priority"
          value={statistics.highestPriorityItem ? statistics.highestPriorityItem.title : "—"}
        />
      </CardContent>
    </Card>
  );
}
