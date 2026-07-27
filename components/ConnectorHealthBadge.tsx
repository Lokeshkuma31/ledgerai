import type { ConnectorHealthStatus } from "@/lib/banks/types";

const STATUS_STYLES: Record<ConnectorHealthStatus, string> = {
  healthy: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  syncing: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  disconnected: "bg-muted text-muted-foreground",
  "authentication-required": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  error: "bg-destructive/10 text-destructive",
  disabled: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<ConnectorHealthStatus, string> = {
  healthy: "Healthy",
  syncing: "Syncing",
  warning: "Warning",
  disconnected: "Disconnected",
  "authentication-required": "Authentication Required",
  error: "Error",
  disabled: "Disabled",
};

export default function ConnectorHealthBadge({ status }: { status: ConnectorHealthStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
