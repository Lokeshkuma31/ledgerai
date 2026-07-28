import { Card, CardContent } from "@/components/ui/card";
import type { DocumentStatistics as Stats } from "@/plugins/document-intelligence/types";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default function DocumentStatistics({ stats }: { stats: Stats }) {
  const tiles: { label: string; value: string }[] = [
    { label: "Documents Imported", value: String(stats.documentsImported) },
    { label: "OCR Success Rate", value: pct(stats.ocrSuccessRate) },
    { label: "Parser Accuracy", value: pct(stats.parserAccuracy) },
    { label: "Avg Extraction Time", value: `${stats.averageExtractionTimeMs}ms` },
    { label: "Duplicates Prevented", value: String(stats.duplicatesPrevented) },
    { label: "Transactions Extracted", value: String(stats.transactionsExtracted) },
    { label: "Unknown Documents", value: String(stats.unknownDocumentsCount) },
  ];

  return (
    <Card size="sm">
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">{tile.label}</span>
            <span className="text-sm font-semibold">{tile.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
