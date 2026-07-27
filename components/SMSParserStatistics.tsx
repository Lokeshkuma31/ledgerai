import { Card, CardContent } from "@/components/ui/card";
import type { ParserStatistics } from "@/plugins/android-sms/types";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

export default function SMSParserStatistics({ stats }: { stats: ParserStatistics }) {
  return (
    <Card size="sm">
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Messages Parsed" value={stats.messagesParsed} />
        <Stat label="Successful Parses" value={stats.successfulParses} />
        <Stat label="Failed Parses" value={stats.failedParses} />
        <Stat label="Average Confidence" value={`${Math.round(stats.averageConfidence * 100)}%`} />
        <Stat label="Duplicates Skipped" value={stats.duplicatesSkipped} />
        <Stat label="Unknown Merchants" value={stats.unknownMerchants} />
        <Stat label="Unknown Formats" value={stats.unknownFormats} />
      </CardContent>
    </Card>
  );
}
