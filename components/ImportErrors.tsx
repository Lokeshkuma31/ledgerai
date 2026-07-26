import type { ImportRowError } from "@/types/import";

export default function ImportErrors({ warnings }: { warnings: ImportRowError[] }) {
  if (warnings.length === 0) return null;

  return (
    <details className="rounded-lg border">
      <summary className="text-muted-foreground cursor-pointer px-3 py-2 text-xs font-medium">
        View {warnings.length} skipped row{warnings.length === 1 ? "" : "s"}
      </summary>
      <ul className="max-h-48 overflow-y-auto border-t px-3 py-2 text-xs">
        {warnings.map((warning, index) => (
          <li key={index} className="flex justify-between gap-2 py-0.5">
            <span className="text-muted-foreground shrink-0">
              {warning.rowNumber > 0 ? `Row ${warning.rowNumber}` : "—"}
            </span>
            <span className="text-right">{warning.message}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
