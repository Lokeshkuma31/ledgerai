import RunStatusBadge from "@/components/RunStatusBadge";
import type { EmailImportRun } from "@/lib/email/types";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDuration(ms: number | null): string {
  return ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

/** A run-by-run import summary table — mirrors components/SyncHistoryTable.tsx's
 * role for the Bank Connector Framework, applied to EmailImportRun instead
 * of SyncRun. Named EmailImportHistory (rather than "ImportSummary", the
 * task's suggested name) because components/ImportSummary.tsx already
 * exists for the unrelated CSV Import feature's ImportReport — this avoids
 * silently overwriting it. */
export default function EmailImportHistory({ runs }: { runs: EmailImportRun[] }) {
  if (runs.length === 0) {
    return <p className="text-muted-foreground text-xs">No imports recorded yet.</p>;
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
            <th className="px-2 py-1.5 text-right font-medium">Fetched</th>
            <th className="px-2 py-1.5 text-right font-medium">Classified</th>
            <th className="px-2 py-1.5 text-right font-medium">Duplicates</th>
            <th className="px-2 py-1.5 text-right font-medium">Created</th>
            <th className="px-2 py-1.5 text-right font-medium">Matched</th>
            <th className="px-2 py-1.5 font-medium">Errors</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((run) => (
            <tr key={run.id} className="border-t">
              <td className="px-2 py-1.5 whitespace-nowrap">{formatTimestamp(run.startedAt)}</td>
              <td className="px-2 py-1.5 capitalize">{run.syncType}</td>
              <td className="px-2 py-1.5">
                <RunStatusBadge status={run.status} />
              </td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatDuration(run.durationMs)}</td>
              <td className="px-2 py-1.5 text-right">{run.emailsFetched}</td>
              <td className="px-2 py-1.5 text-right">{run.financialEmailsClassified}</td>
              <td className="px-2 py-1.5 text-right">{run.duplicatesDetected}</td>
              <td className="px-2 py-1.5 text-right">{run.transactionsCreated}</td>
              <td className="px-2 py-1.5 text-right">{run.transactionsMatched}</td>
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
