import { Card, CardContent } from "@/components/ui/card";
import type { SyncEngineHealth } from "@/lib/sync/types";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

const CONNECTION_STYLES: Record<string, string> = {
  healthy: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  degraded: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  offline: "bg-destructive/10 text-destructive",
  unknown: "bg-muted text-muted-foreground",
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Engine-wide stats plus a per-provider health breakdown — the spec's
 * "Health" section (Queue Size, Running/Failed Jobs, Average Sync Time,
 * Average Items Imported, Success Rate, Last Successful Sync) at both
 * levels. */
export default function ProviderHealthTable({ health }: { health: SyncEngineHealth }) {
  return (
    <div className="flex flex-col gap-3">
      <Card size="sm">
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Queue Size" value={health.queueSize} />
          <Stat label="Running Jobs" value={health.runningJobs} />
          <Stat label="Failed Jobs" value={health.failedJobs} />
          <Stat label="Success Rate" value={`${Math.round(health.successRate * 100)}%`} />
          <Stat label="Avg Sync Time" value={`${health.averageSyncTimeMs}ms`} />
          <Stat label="Avg Items Imported" value={health.averageItemsImported} />
          <Stat label="Last Successful Sync" value={formatTimestamp(health.lastSuccessfulSyncAt)} />
        </CardContent>
      </Card>

      {health.byProvider.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="pb-2 pr-3 font-medium">Provider</th>
                <th className="pb-2 pr-3 font-medium">Connection</th>
                <th className="pb-2 pr-3 font-medium">Queue</th>
                <th className="pb-2 pr-3 font-medium">Running</th>
                <th className="pb-2 pr-3 font-medium">Failed</th>
                <th className="pb-2 pr-3 font-medium">Success</th>
                <th className="pb-2 font-medium">Last Success</th>
              </tr>
            </thead>
            <tbody>
              {health.byProvider.map((provider) => (
                <tr key={provider.providerId} className="border-border border-t">
                  <td className="py-2 pr-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{provider.providerName}</span>
                      <span className="text-muted-foreground text-xs">{provider.category}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${CONNECTION_STYLES[provider.connection.status]}`}
                      title={provider.connection.message}
                    >
                      {provider.connection.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{provider.queueSize}</td>
                  <td className="py-2 pr-3">{provider.runningJobs}</td>
                  <td className="py-2 pr-3">{provider.failedJobs}</td>
                  <td className="py-2 pr-3">{Math.round(provider.successRate * 100)}%</td>
                  <td className="py-2">{formatTimestamp(provider.lastSuccessfulSyncAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
