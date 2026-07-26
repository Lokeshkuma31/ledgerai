import { Button } from "@/components/ui/button";
import QueryResultCard from "@/components/QueryResult";
import type { QueryResult } from "@/types/query";

export default function ConversationHistory({
  history,
  onDelete,
  onClear,
}: {
  history: QueryResult[];
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  if (history.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Ask a question above to get started.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-medium">
          Conversation History
        </span>
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear History
        </Button>
      </div>
      {history.map((result) => (
        <QueryResultCard key={result.id} result={result} onDelete={onDelete} />
      ))}
    </div>
  );
}
