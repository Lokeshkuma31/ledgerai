"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import ConnectButton from "@/components/ConnectButton";
import ConnectionDetails from "@/components/ConnectionDetails";
import ConnectionHealth from "@/components/ConnectionHealth";
import ScopeViewer from "@/components/ScopeViewer";
import { disconnectConnectionAction, refreshConnectionAction, renameConnectionAction } from "@/lib/connections/actions";
import type { ConnectionRecord, ProviderDescriptor } from "@/lib/connections/types";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const RECONNECT_STATUSES = new Set(["expired", "authentication-failed", "permission-revoked"]);

export default function ProviderCard({ descriptor, record }: { descriptor: ProviderDescriptor; record: ConnectionRecord | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(record?.displayName ?? descriptor.name);

  // Server Actions' own revalidatePath("/connections") already invalidates
  // the Router Cache; router.refresh() is a deliberate belt-and-suspenders
  // guarantee that this Server Component subtree re-fetches immediately,
  // since this page's data (registry.ts uses node:fs) can only ever be
  // read server-side — unlike every other framework in this app, this
  // component has no client-side store of its own to fall back on.
  async function withBusy(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  function handleDisconnect() {
    if (!record) return;
    void withBusy(async () => {
      await disconnectConnectionAction(record.id);
    });
  }

  function handleRefresh() {
    if (!record) return;
    void withBusy(async () => {
      const result = await refreshConnectionAction(record.id);
      if (result.error) throw new Error(result.error);
    });
  }

  function handleSaveRename() {
    if (!record) return;
    void withBusy(async () => {
      await renameConnectionAction(record.id, nameInput);
      setRenaming(false);
    });
  }

  const connected = record?.status === "connected";
  const needsReconnect = record ? RECONNECT_STATUSES.has(record.status) : false;

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col">
          {renaming ? (
            <div className="flex items-center gap-1.5">
              <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} className="h-7 w-40" />
              <Button size="xs" onClick={handleSaveRename} disabled={busy}>
                Save
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setRenaming(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          ) : (
            <CardTitle className="text-base">{record?.displayName || descriptor.name}</CardTitle>
          )}
          <span className="text-muted-foreground text-xs">{descriptor.metadata.description}</span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {record && <ConnectionHealth status={record.health.status} />}
          <span
            className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap capitalize ${
              connected ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
            }`}
          >
            {(record?.status ?? "not-connected").replace(/-/g, " ")}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="text-destructive text-xs">{error}</p>}

        {record ? (
          <>
            <p className="text-muted-foreground text-xs">{record.email}</p>
            <p className="text-muted-foreground text-xs">
              Connected since {formatTimestamp(record.connectedAt)} · Last validated {formatTimestamp(record.lastValidated)}
            </p>
            <ScopeViewer scopes={record.scopes} />
          </>
        ) : (
          <p className="text-muted-foreground text-xs">Not connected.</p>
        )}

        <div className="flex flex-wrap gap-2">
          {!record || record.status === "disconnected" ? (
            <ConnectButton provider={descriptor.id} />
          ) : needsReconnect ? (
            <>
              <ConnectButton provider={descriptor.id} reconnectId={record.id} />
              <Button size="xs" variant="outline" onClick={handleDisconnect} disabled={busy}>
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <Button size="xs" variant="outline" onClick={handleRefresh} disabled={busy}>
                Refresh
              </Button>
              <Button size="xs" variant="outline" onClick={handleDisconnect} disabled={busy}>
                Disconnect
              </Button>
              <Button size="xs" variant="outline" onClick={() => setRenaming(true)} disabled={busy}>
                Rename
              </Button>
            </>
          )}
          {record && (
            <Button size="xs" variant="ghost" onClick={() => setShowDetails((v) => !v)}>
              {showDetails ? "Hide Details" : "View Details"}
            </Button>
          )}
        </div>

        {showDetails && record && <ConnectionDetails record={record} descriptor={descriptor} />}
      </CardContent>
    </Card>
  );
}
