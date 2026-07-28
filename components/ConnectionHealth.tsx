import type { ConnectionHealthStatus } from "@/lib/connections/types";

const STATUS_STYLES: Record<ConnectionHealthStatus, string> = {
  healthy: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "expired-token": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "permission-revoked": "bg-destructive/10 text-destructive",
  "authentication-failed": "bg-destructive/10 text-destructive",
  disconnected: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<ConnectionHealthStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  "expired-token": "Expired Token",
  "permission-revoked": "Permission Revoked",
  "authentication-failed": "Authentication Failed",
  disconnected: "Disconnected",
};

export default function ConnectionHealth({ status }: { status: ConnectionHealthStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}
