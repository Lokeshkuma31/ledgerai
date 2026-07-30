import { Card, CardContent } from "@/components/ui/card";
import type { SyncQueueSnapshot } from "@/lib/sync/types";

/** Live view of the Synchronization Queue: what's running right now
 * (bounded by concurrencyLimit) and what's waiting its turn. */
export default function QueueMonitor({ queue }: { queue: SyncQueueSnapshot }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Sync Queue</h2>
      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          <span className="text-muted-foreground text-xs">
            {queue.running.length}/{queue.concurrencyLimit} slots running · {queue.queued.length} queued
          </span>

          {queue.running.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium">Running</span>
              {queue.running.map((job) => (
                <div key={job.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{job.plugin}</span>
                  <span className="text-muted-foreground text-xs">{job.type}</span>
                </div>
              ))}
            </div>
          )}

          {queue.queued.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium">Queued</span>
              {queue.queued.map((job, index) => (
                <div key={job.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {index + 1}. {job.plugin}
                  </span>
                  <span className="text-muted-foreground text-xs">{job.type}</span>
                </div>
              ))}
            </div>
          )}

          {queue.running.length === 0 && queue.queued.length === 0 && (
            <p className="text-muted-foreground text-sm">Nothing queued or running.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
