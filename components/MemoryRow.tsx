import { Button } from "@/components/ui/button";
import type { MemoryEntry } from "@/lib/ai/memory";

export default function MemoryRow({
  entry,
  onDelete,
}: {
  entry: MemoryEntry;
  onDelete: (key: string) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b py-3 last:border-b-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{entry.note}</span>
        <span className="text-muted-foreground text-xs">
          ↓ {entry.category}
        </span>
      </div>
      <Button variant="outline" size="sm" onClick={() => onDelete(entry.key)}>
        Delete
      </Button>
    </div>
  );
}
