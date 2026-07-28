import { Card, CardContent } from "@/components/ui/card";
import type { EmailStatistics as Stats } from "@/lib/email/types";

export default function EmailStatistics({ stats }: { stats: Stats }) {
  const tiles: { label: string; value: string }[] = [
    { label: "Emails Imported", value: String(stats.emailsImported) },
    { label: "Financial Emails", value: String(stats.financialEmailsClassified) },
    { label: "Attachments Processed", value: String(stats.attachmentsProcessed) },
    { label: "Duplicates Detected", value: String(stats.duplicatesDetected) },
    { label: "Transactions Created", value: String(stats.transactionsCreated) },
    { label: "Transactions Matched", value: String(stats.transactionsMatched) },
    { label: "Import Errors", value: String(stats.importErrors) },
    { label: "Unknown Emails", value: String(stats.unknownEmailsCount) },
  ];

  return (
    <Card size="sm">
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
