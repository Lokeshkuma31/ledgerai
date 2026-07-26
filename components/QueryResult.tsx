import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { QueryResult as QueryResultData } from "@/types/query";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function QueryResult({
  result,
  onDelete,
}: {
  result: QueryResultData;
  onDelete: (id: string) => void;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium">{result.question}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onDelete(result.id)}
            aria-label="Delete this question"
          >
            <XIcon />
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">{result.answer}</p>
        <span className="text-muted-foreground text-xs">{formatTimestamp(result.createdAt)}</span>
      </CardContent>
    </Card>
  );
}
