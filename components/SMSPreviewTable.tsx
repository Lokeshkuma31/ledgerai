import type { ImportRowStatus, SmsImportPreviewRow } from "@/plugins/android-sms/types";

function statusBadgeClass(status: ImportRowStatus): string {
  switch (status) {
    case "Ready":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "Duplicate":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "Malformed":
    case "Unknown Format":
      return "bg-destructive/10 text-destructive";
    case "Skipped":
      return "bg-muted text-muted-foreground";
    case "Imported":
      return "bg-primary/10 text-primary";
  }
}

function formatAmount(row: SmsImportPreviewRow): string {
  if (!row.normalized) return "—";
  const symbol = row.normalized.currency === "INR" ? "₹" : "$";
  return `${symbol}${row.normalized.amount.toLocaleString("en-IN")}`;
}

export default function SMSPreviewTable({
  rows,
  selectedIds,
  onToggleRow,
}: {
  rows: SmsImportPreviewRow[];
  selectedIds: Set<string>;
  onToggleRow: (messageId: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No messages scanned yet.</p>;
  }

  return (
    <div className="max-h-96 overflow-y-auto rounded-lg border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground sticky top-0">
          <tr>
            <th className="px-2 py-1.5 font-medium" />
            <th className="px-2 py-1.5 font-medium">Raw Message</th>
            <th className="px-2 py-1.5 font-medium">Merchant</th>
            <th className="px-2 py-1.5 text-right font-medium">Amount</th>
            <th className="px-2 py-1.5 font-medium">Date</th>
            <th className="px-2 py-1.5 text-right font-medium">Confidence</th>
            <th className="px-2 py-1.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selectable = row.status === "Ready";
            return (
              <tr key={row.message.id} className="border-t">
                <td className="px-2 py-1.5">
                  {selectable && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.message.id)}
                      onChange={() => onToggleRow(row.message.id)}
                      aria-label={`Select message ${row.message.id} for import`}
                    />
                  )}
                </td>
                <td className="max-w-56 truncate px-2 py-1.5" title={row.message.body}>
                  {row.message.body}
                </td>
                <td className="px-2 py-1.5">{row.normalized?.merchant ?? "—"}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatAmount(row)}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{row.normalized?.date ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">
                  {row.normalized ? `${Math.round(row.normalized.confidence * 100)}%` : "—"}
                </td>
                <td className="px-2 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${statusBadgeClass(row.status)}`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
