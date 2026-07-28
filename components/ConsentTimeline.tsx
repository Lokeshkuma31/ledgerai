import { Card, CardContent } from "@/components/ui/card";
import type { ConsentTimelineEntry } from "@/plugins/account-aggregator/types";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ConsentTimeline({ entries }: { entries: ConsentTimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <Card size="sm">
        <CardContent>
          <p className="text-muted-foreground text-sm">No consent activity yet.</p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...entries].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <span className="text-sm font-medium">Consent Timeline</span>
        <ol className="flex flex-col gap-2 border-l pl-3">
          {sorted.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="flex flex-col gap-0.5">
              <span className="text-xs font-medium">{entry.status}</span>
              <span className="text-muted-foreground text-xs">{entry.note}</span>
              <span className="text-muted-foreground text-xs">{formatTimestamp(entry.at)}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
