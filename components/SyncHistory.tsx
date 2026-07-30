import { Card, CardContent } from "@/components/ui/card";
import type { SyncJob, SyncJobStatus } from "@/lib/sync/types";

const STATUS_STYLES: Record<SyncJobStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  paused: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  partial: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

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
              <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${STATUS_STYLES[job.status]}`}>
                {job.status}
              </span>
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
