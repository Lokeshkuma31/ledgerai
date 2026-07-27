import type { SyncRun, SyncRunStatus } from "@/lib/banks/types";

const STATUS_STYLES: Record<SyncRunStatus, string> = {
  running: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  partial: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  failed: "bg-destructive/10 text-destructive",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null): string {
  return ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

export default function SyncHistoryTable({ runs }: { runs: SyncRun[] }) {
  if (runs.length === 0) {
    return <p className="text-muted-foreground text-xs">No syncs recorded yet.</p>;
  }

  const sorted = [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return (
    <div className="max-h-64 overflow-y-auto rounded-lg border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground sticky top-0">
          <tr>
            <th className="px-2 py-1.5 font-medium">Started</th>
            <th className="px-2 py-1.5 font-medium">Type</th>
            <th className="px-2 py-1.5 font-medium">Status</th>
            <th className="px-2 py-1.5 text-right font-medium">Duration</th>
            <th className="px-2 py-1.5 text-right font-medium">Imported</th>
            <th className="px-2 py-1.5 text-right font-medium">Updated</th>
            <th className="px-2 py-1.5 text-right font-medium">Duplicates</th>
            <th className="px-2 py-1.5 font-medium">Errors</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((run) => (
            <tr key={run.id} className="border-t">
              <td className="px-2 py-1.5 whitespace-nowrap">{formatTimestamp(run.startedAt)}</td>
              <td className="px-2 py-1.5 capitalize">{run.syncType}</td>
              <td className="px-2 py-1.5">
                <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap capitalize ${STATUS_STYLES[run.status]}`}>
                  {run.status}
                </span>
              </td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatDuration(run.durationMs)}</td>
              <td className="px-2 py-1.5 text-right">{run.transactionsImported}</td>
              <td className="px-2 py-1.5 text-right">{run.transactionsUpdated}</td>
              <td className="px-2 py-1.5 text-right">{run.duplicatesIgnored}</td>
              <td className="px-2 py-1.5" title={run.errors.map((e) => e.message).join("; ")}>
                {run.errors.length > 0 ? run.errors.length : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
