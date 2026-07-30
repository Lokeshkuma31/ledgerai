import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SyncJob, SyncJobStatus, SyncProvider } from "@/lib/sync/types";

const STATUS_STYLES: Record<SyncJobStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  paused: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  partial: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const CATEGORY_LABELS: Record<SyncProvider["category"], string> = {
  email: "Email",
  bank: "Bank",
  sms: "SMS",
  document: "Document",
  other: "Other",
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** One registered provider, its most recent job, and every lifecycle
 * action the spec asks for — Manual/Retry/Resume/Pause/Cancel. Scheduled
 * and Initial/Incremental syncs are driven by the dashboard's "Run Due
 * Schedules" action and the provider's own sync() respectively, not a
 * button here. */
export default function SyncJobCard({
  provider,
  latestJob,
  isStarting,
  onStart,
  onRetry,
  onResume,
  onPause,
  onCancel,
}: {
  provider: SyncProvider;
  latestJob?: SyncJob;
  isStarting?: boolean;
  onStart: () => void;
  onRetry: () => void;
  onResume: () => void;
  onPause: (jobId: string) => void;
  onCancel: (jobId: string) => void;
}) {
  const isActive = latestJob?.status === "queued" || latestJob?.status === "running";
  const canRetry = latestJob?.status === "failed" || latestJob?.status === "partial";
  const canResume = (latestJob?.status === "paused" || latestJob?.status === "cancelled") && latestJob.lastCheckpoint !== null;

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{provider.name}</span>
            <span className="text-muted-foreground text-xs">{CATEGORY_LABELS[provider.category]}</span>
          </div>
          {latestJob && (
            <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${STATUS_STYLES[latestJob.status]}`}>
              {latestJob.status}
            </span>
          )}
        </div>

        {latestJob ? (
          <span className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
            {latestJob.type} · {formatTimestamp(latestJob.startedAt)} · {latestJob.duration ?? 0}ms
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">Never synced.</span>
        )}

        {latestJob && (latestJob.status === "completed" || latestJob.status === "partial") && (
          <p className="text-sm">
            Imported {latestJob.itemsImported}, skipped {latestJob.itemsSkipped}, {latestJob.duplicates} duplicate(s).
          </p>
        )}
        {latestJob && latestJob.errors.length > 0 && (
          <p className="text-destructive text-xs">{latestJob.errors[0].message}</p>
        )}
        {latestJob && latestJob.retryCount > 0 && (
          <span className="text-muted-foreground text-xs">Retried {latestJob.retryCount} time(s).</span>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {!isActive && (
            <Button variant="outline" size="xs" onClick={onStart} disabled={isStarting}>
              {isStarting ? "Starting…" : "Sync Now"}
            </Button>
          )}
          {canRetry && (
            <Button variant="outline" size="xs" onClick={onRetry}>
              Retry
            </Button>
          )}
          {canResume && (
            <Button variant="outline" size="xs" onClick={onResume}>
              Resume
            </Button>
          )}
          {isActive && latestJob && (
            <>
              <Button variant="outline" size="xs" onClick={() => onPause(latestJob.id)}>
                Pause
              </Button>
              <Button variant="destructive" size="xs" onClick={() => onCancel(latestJob.id)}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
