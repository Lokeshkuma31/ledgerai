import { Card, CardContent } from "@/components/ui/card";
import ConnectionHealth from "@/components/ConnectionHealth";
import ScopeViewer from "@/components/ScopeViewer";
import type { ConnectionRecord, ProviderDescriptor } from "@/lib/connections/types";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const CAPABILITY_LABELS: Record<string, string> = { identity: "Identity", "email-read": "Read email (future milestone)" };

export default function ConnectionDetails({ record, descriptor }: { record: ConnectionRecord; descriptor: ProviderDescriptor }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Provider</span>
            <span className="font-medium">{descriptor.name}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Account</span>
            <span className="font-medium">{record.email}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Health</span>
            <ConnectionHealth status={record.health.status} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Connected Since</span>
            <span className="font-medium">{formatTimestamp(record.connectedAt)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Last Validated</span>
            <span className="font-medium">{formatTimestamp(record.lastValidated)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Token Expiry</span>
            <span className="font-medium">{formatTimestamp(record.tokenExpiresAt)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs font-medium">Granted Permissions</span>
          <ScopeViewer scopes={record.scopes} />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs font-medium">Capabilities</span>
          <div className="flex flex-wrap gap-1">
            {descriptor.supportedCapabilities.map((cap) => (
              <span key={cap} className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                {CAPABILITY_LABELS[cap] ?? cap}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs font-medium">Connection History</span>
          {record.history.length === 0 ? (
            <p className="text-muted-foreground text-xs">No history yet.</p>
          ) : (
            <ol className="flex flex-col gap-1.5 border-l pl-3">
              {[...record.history]
                .reverse()
                .slice(0, 10)
                .map((event, index) => (
                  <li key={index} className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium capitalize">{event.type.replace(/-/g, " ")}</span>
                    <span className="text-muted-foreground text-xs">{event.message}</span>
                    <span className="text-muted-foreground text-xs">{formatTimestamp(event.at)}</span>
                  </li>
                ))}
            </ol>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
