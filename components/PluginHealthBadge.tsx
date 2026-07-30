import { Badge } from "@/components/ui/badge";
import type { PluginHealthStatus } from "@/types/plugin";

const STATUS_VARIANT: Record<PluginHealthStatus, "success" | "warning" | "destructive" | "secondary"> = {
  healthy: "success",
  warning: "warning",
  error: "destructive",
  disabled: "secondary",
  unavailable: "secondary",
};

const STATUS_LABELS: Record<PluginHealthStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  error: "Error",
  disabled: "Disabled",
  unavailable: "Unavailable",
};

export default function PluginHealthBadge({ status }: { status: PluginHealthStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}
