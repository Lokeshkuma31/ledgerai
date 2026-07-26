"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setSourceEnabled, sourceRegistry } from "@/lib/sources";
import type { SourceMetadata } from "@/types/source";

interface SourceRow {
  id: string;
  name: string;
  metadata: SourceMetadata;
}

function formatLastSync(lastSync: string | null): string {
  if (!lastSync) return "Never";
  return new Date(lastSync).toLocaleString();
}

export default function SourceSettings() {
  const [rows, setRows] = useState<SourceRow[]>([]);

  const refresh = useCallback(() => {
    setRows(
      sourceRegistry
        .getAllSources()
        .map((source) => ({
          id: source.id,
          name: source.name,
          metadata: source.metadata(),
        })),
    );
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function handleToggle(id: string, enabled: boolean) {
    setSourceEnabled(id, enabled);
    refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => {
        const isComingSoon = row.metadata.status === "coming-soon";
        return (
          <Card key={row.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2 text-base">
                {row.metadata.enabled && (
                  <span className="text-primary" aria-hidden>
                    ✓
                  </span>
                )}
                {row.name}
                {isComingSoon && (
                  <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-normal">
                    Coming Soon
                  </span>
                )}
              </CardTitle>
              {!isComingSoon && (
                <Button
                  variant={row.metadata.enabled ? "outline" : "default"}
                  size="sm"
                  onClick={() => handleToggle(row.id, !row.metadata.enabled)}
                >
                  {row.metadata.enabled ? "Disable" : "Enable"}
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-muted-foreground text-sm">
                {row.metadata.description}
              </p>
              <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <dt>Version</dt>
                  <dd>{row.metadata.version}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Status</dt>
                  <dd className="capitalize">{row.metadata.status}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Enabled</dt>
                  <dd>{row.metadata.enabled ? "Yes" : "No"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Health</dt>
                  <dd className="capitalize">{row.metadata.health}</dd>
                </div>
                <div className="col-span-2 flex justify-between gap-2">
                  <dt>Last Sync</dt>
                  <dd>{formatLastSync(row.metadata.lastSync)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
