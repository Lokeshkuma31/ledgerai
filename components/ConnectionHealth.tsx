import { Badge } from "@/components/ui/badge";
import type { ConnectionHealthStatus } from "@/lib/connections/types";

const STATUS_VARIANT: Record<ConnectionHealthStatus, "success" | "warning" | "destructive" | "secondary"> = {
  healthy: "success",
  warning: "warning",
  "expired-token": "warning",
  "permission-revoked": "destructive",
  "authentication-failed": "destructive",
  disconnected: "secondary",
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
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}
