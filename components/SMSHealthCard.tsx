import { Card, CardContent } from "@/components/ui/card";
import PluginHealthBadge from "@/components/PluginHealthBadge";
import type { PluginHealth } from "@/types/plugin";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SMSHealthCard({
  health,
  enabled,
  mockMessageCount,
  importedCount,
  duplicateCount,
  averageConfidence,
  lastImportAt,
}: {
  health: PluginHealth;
  enabled: boolean;
  mockMessageCount: number;
  importedCount: number;
  duplicateCount: number;
  averageConfidence: number;
  lastImportAt: string | null;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Plugin Status</span>
          <div className="flex items-center gap-1.5">
            <PluginHealthBadge status={health.status} />
            <span
              className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${
                enabled
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">{health.message}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Mock SMS Count</dt>
            <dd className="text-sm font-semibold">{mockMessageCount}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Imported Transactions</dt>
            <dd className="text-sm font-semibold">{importedCount}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Duplicate Count</dt>
            <dd className="text-sm font-semibold">{duplicateCount}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Parser Confidence</dt>
            <dd className="text-sm font-semibold">{Math.round(averageConfidence * 100)}%</dd>
          </div>
          <div className="col-span-2 flex flex-col gap-0.5 sm:col-span-1">
            <dt className="text-muted-foreground">Last Import</dt>
            <dd className="text-sm font-semibold">{formatTimestamp(lastImportAt)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
