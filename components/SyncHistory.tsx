import { Card, CardContent } from "@/components/ui/card";
import SyncJobStatusBadge from "@/components/SyncJobStatusBadge";
import type { SyncJob } from "@/lib/sync/types";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Every recorded job across every provider, most recent first — the
 * spec's exact Sync History field list (Provider, Start/End Time,
 * Duration, Imported, Skipped, Duplicates, Errors, Warnings, Status) shown
 * per row. */
export default function SyncHistory({ jobs }: { jobs: SyncJob[] }) {
  const sorted = [...jobs].sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Sync History</h2>
        <Card>
          <CardContent>
            <p className="text-muted-foreground">No sync jobs recorded yet.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Sync History</h2>
      <div className="flex flex-col gap-2">
        {sorted.map((job) => (
          <div key={job.id} className="border-border rounded-lg border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{job.plugin}</span>
              <SyncJobStatusBadge status={job.status} />
            </div>
            <span className="text-muted-foreground text-xs">
              {job.type} · {formatTimestamp(job.queuedAt)}
              {job.completedAt ? ` → ${formatTimestamp(job.completedAt)}` : ""} · {job.duration ?? 0}ms
            </span>
            <div className="text-muted-foreground mt-1 flex flex-wrap gap-3 text-xs">
              <span>Imported {job.itemsImported}</span>
              <span>Skipped {job.itemsSkipped}</span>
              <span>Duplicates {job.duplicates}</span>
              {job.errors.length > 0 && <span className="text-destructive">{job.errors.length} error(s)</span>}
              {job.warnings.length > 0 && <span>{job.warnings.length} warning(s)</span>}
              {job.retryCount > 0 && <span>{job.retryCount} retries</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
