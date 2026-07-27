import type { PluginHealthStatus } from "@/types/plugin";

const STATUS_STYLES: Record<PluginHealthStatus, string> = {
  healthy: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  error: "bg-destructive/10 text-destructive",
  disabled: "bg-muted text-muted-foreground",
  unavailable: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<PluginHealthStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  error: "Error",
  disabled: "Disabled",
  unavailable: "Unavailable",
};

export default function PluginHealthBadge({ status }: { status: PluginHealthStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
