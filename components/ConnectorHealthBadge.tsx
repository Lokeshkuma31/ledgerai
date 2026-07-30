import { Badge } from "@/components/ui/badge";
import type { ConnectorHealthStatus } from "@/lib/banks/types";

const STATUS_VARIANT: Record<ConnectorHealthStatus, "success" | "warning" | "destructive" | "secondary" | "info"> = {
  healthy: "success",
  syncing: "info",
  warning: "warning",
  disconnected: "secondary",
  "authentication-required": "warning",
  error: "destructive",
  disabled: "secondary",
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
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}
