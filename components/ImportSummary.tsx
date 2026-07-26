import type { ImportReport } from "@/types/import";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

export default function ImportSummary({ report }: { report: ImportReport }) {
  const seconds = (report.durationMs / 1000).toFixed(1);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold">Import Complete</h3>
        <p className="text-muted-foreground text-xs">
          {report.fileName} · {seconds}s
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Imported" value={report.importedCount} />
        <Stat label="Skipped" value={report.skippedCount} />
        <Stat label="Duplicates" value={report.duplicateCount} />
        <Stat label="Detected Merchants" value={report.detectedMerchantCount} />
        <Stat label="New Merchants" value={report.newMerchantCount} />
        <Stat label="AI Categories Assigned" value={report.aiCategoriesAssignedCount} />
        <Stat label="Memory Matches" value={report.memoryMatchCount} />
        <Stat label="Warnings" value={report.warnings.length} />
      </div>
    </div>
  );
}
