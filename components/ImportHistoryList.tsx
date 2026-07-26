"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ImportErrors from "@/components/ImportErrors";
import { getImportHistory } from "@/lib/import/history";
import type { ImportHistoryEntry } from "@/types/import";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ImportHistoryList() {
  const [entries, setEntries] = useState<ImportHistoryEntry[]>([]);

  useEffect(() => {
    setEntries(getImportHistory());
  }, []);

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">
            No imports yet. Use &ldquo;Import CSV&rdquo; on the Dashboard to
            bring in historical transactions.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {entries.map((entry) => (
        <Card key={entry.id}>
          <CardHeader>
            <CardTitle className="text-base">{entry.fileName}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt>Imported</dt>
                <dd>{entry.importedCount} transactions</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Skipped</dt>
                <dd>{entry.skippedCount} rows</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Last Import</dt>
                <dd>{formatDate(entry.importedAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Duration</dt>
                <dd>{(entry.durationMs / 1000).toFixed(1)}s</dd>
              </div>
            </dl>
            <ImportErrors warnings={entry.warnings} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
