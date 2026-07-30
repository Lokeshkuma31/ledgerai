import Link from "next/link";
import type { ConnectionHealthStatus, ConnectionRecord, ProviderId } from "@/lib/connections/types";

const PROVIDER_LABELS: Record<ProviderId, string> = {
  google: "Gmail",
  microsoft: "Outlook",
  yahoo: "Yahoo Mail",
};

const HEALTH_DOT: Record<ConnectionHealthStatus, string> = {
  healthy: "bg-success",
  warning: "bg-warning",
  "expired-token": "bg-warning",
  "permission-revoked": "bg-destructive",
  "authentication-failed": "bg-destructive",
  disconnected: "bg-muted-foreground",
};

export default function ConnectionsMini({ connections }: { connections: ConnectionRecord[] }) {
  const active = connections.filter((c) => c.status !== "disconnected").slice(0, 3);

  if (active.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No connections yet.{" "}
        <Link href="/connections" className="text-primary hover:underline">
          Connect an account
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {active.map((c) => (
        <div key={c.id} className="flex items-center gap-2.5">
          <div className="from-primary to-ai flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-bold text-white">
            {PROVIDER_LABELS[c.provider][0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{PROVIDER_LABELS[c.provider]}</div>
            <div className="text-muted-foreground truncate text-xs">{c.email || c.displayName}</div>
          </div>
          <span className={`size-2 shrink-0 rounded-full ${HEALTH_DOT[c.health.status]}`} />
        </div>
      ))}
    </div>
  );
}
