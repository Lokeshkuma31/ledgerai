import { Card, CardContent } from "@/components/ui/card";
import type { PolicyStatistics as PolicyStatisticsData } from "@/types/policy";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export default function PolicyStatistics({ statistics }: { statistics: PolicyStatisticsData }) {
  return (
    <Card size="sm">
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Generated" value={statistics.notificationsGenerated} />
        <Stat label="Suppressed" value={statistics.notificationsSuppressed} />
        <Stat label="Avg Daily" value={statistics.averageDailyNotifications} />
        <Stat label="Cooldown Hits" value={statistics.cooldownHits} />
        <Stat label="Overrides" value={statistics.policyOverrides} />
        <Stat label="Most Triggered Rule" value={statistics.mostTriggeredRule ?? "—"} />
        <Stat
          label="Highest Priority"
          value={statistics.highestPriorityAlert ? statistics.highestPriorityAlert.title : "—"}
        />
      </CardContent>
    </Card>
  );
}
