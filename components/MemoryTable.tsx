import { Card, CardContent } from "@/components/ui/card";
import MemoryRow from "@/components/MemoryRow";
import type { MemoryEntry } from "@/lib/ai/memory";

export default function MemoryTable({
  entries,
  onDelete,
}: {
  entries: MemoryEntry[];
  onDelete: (key: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">
            No remembered categories yet. Review a transaction to teach
            LedgerAI.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col">
        {entries.map((entry) => (
          <MemoryRow key={entry.key} entry={entry} onDelete={onDelete} />
        ))}
      </CardContent>
    </Card>
  );
}
