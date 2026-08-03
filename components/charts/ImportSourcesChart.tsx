import { Badge } from "@/components/ui/badge";
import ChartCard from "./ChartCard";
import type { ImportHistoryEntry } from "@/types/import";

/**
 * Renders lib/import/history.ts::getImportHistory() directly — "source"
 * resolves to the uploaded file name, not a bank/provider name, since
 * that's the only identifier the Import pipeline records today.
 */
export default function ImportSourcesChart({ history }: { history: ImportHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <ChartCard title="Import Sources" description="Files imported, most recent first.">
        <p className="text-muted-foreground py-16 text-center text-sm">No imports recorded yet.</p>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Import Sources"
      description='Files imported, most recent first. "Source" reflects the uploaded file name, not a bank/provider name.'
      csvData={{
        headers: ["File", "Imported At", "Imported", "Skipped", "Duration (ms)"],
        rows: history.map((h) => [h.fileName, h.importedAt, h.importedCount, h.skippedCount, h.durationMs]),
      }}
    >
      <div className="flex flex-col gap-2">
        {history.slice(0, 20).map((h) => (
          <div key={h.id} className="border-border flex items-center justify-between gap-3 border-t py-2.5 first:border-t-0">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{h.fileName}</span>
              <span className="text-muted-foreground text-xs">{new Date(h.importedAt).toLocaleString()}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="success">{h.importedCount} imported</Badge>
              {h.skippedCount > 0 && <Badge variant="secondary">{h.skippedCount} skipped</Badge>}
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
