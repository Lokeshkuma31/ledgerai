import type { FinancialEventSeverity } from "@/types/event";

const SEVERITY_STYLES: Record<FinancialEventSeverity, string> = {
  info: "bg-muted text-muted-foreground",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  important: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  critical: "bg-destructive/10 text-destructive",
};

const SEVERITY_LABELS: Record<FinancialEventSeverity, string> = {
  info: "Info",
  warning: "Warning",
  important: "Important",
  critical: "Critical",
};

export default function FinancialEventBadge({
  severity,
}: {
  severity: FinancialEventSeverity;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${SEVERITY_STYLES[severity]}`}
    >
      {SEVERITY_LABELS[severity]}
    </span>
  );
}
