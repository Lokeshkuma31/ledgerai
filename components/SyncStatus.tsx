import { Card, CardContent } from "@/components/ui/card";
import type { SyncRun } from "@/lib/banks/types";

const CAPABILITIES = [
  "Institution Discovery",
  "Consent Request",
  "Consent Status",
  "Account Discovery",
  "Account Metadata",
  "Balance Sync",
  "Transaction Sync",
  "Refresh",
  "Disconnect",
  "Health Check",
];

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function SyncStatus({ latestRun }: { latestRun: SyncRun | undefined }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div>
          <span className="text-sm font-medium">Sync Status</span>
          {latestRun ? (
            <p className="text-muted-foreground text-xs">
              Last sync: {formatTimestamp(latestRun.completedAt)} · <span className="capitalize">{latestRun.status}</span> ·{" "}
              {latestRun.transactionsImported} imported, {latestRun.transactionsUpdated} updated,{" "}
              {latestRun.duplicatesIgnored} duplicate(s)
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">No syncs recorded yet.</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs font-medium">Supported Capabilities</span>
          <div className="flex flex-wrap gap-1">
            {CAPABILITIES.map((c) => (
              <span key={c} className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                {c}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
