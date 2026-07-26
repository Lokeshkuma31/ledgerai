import type { ImportPreviewRow } from "@/types/import";

function statusBadgeClass(status: ImportPreviewRow["status"]): string {
  switch (status) {
    case "Ready":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "Duplicate":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "Invalid":
      return "bg-destructive/10 text-destructive";
  }
}

function formatAmount(amount: number | null): string {
  return amount === null ? "—" : `₹${amount.toLocaleString("en-IN")}`;
}

export default function ImportPreviewTable({ rows }: { rows: ImportPreviewRow[] }) {
  return (
    <div className="max-h-72 overflow-y-auto rounded-lg border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground sticky top-0">
          <tr>
            <th className="px-2 py-1.5 font-medium">Date</th>
            <th className="px-2 py-1.5 font-medium">Description</th>
            <th className="px-2 py-1.5 font-medium">Merchant</th>
            <th className="px-2 py-1.5 text-right font-medium">Amount</th>
            <th className="px-2 py-1.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rowNumber} className="border-t">
              <td className="px-2 py-1.5 whitespace-nowrap">{row.date || "—"}</td>
              <td className="max-w-40 truncate px-2 py-1.5" title={row.description}>
                {row.description || "—"}
              </td>
              <td className="px-2 py-1.5">{row.merchantName ?? "—"}</td>
              <td className="px-2 py-1.5 text-right">{formatAmount(row.amount)}</td>
              <td className="px-2 py-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(row.status)}`}
                >
                  {row.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
