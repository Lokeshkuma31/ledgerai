import type { FeedSeverity } from "@/types/feed";

const SEVERITY_STYLES: Record<FeedSeverity, string> = {
  positive: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  info: "bg-muted text-muted-foreground",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  important: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  critical: "bg-destructive/10 text-destructive",
};

const SEVERITY_LABELS: Record<FeedSeverity, string> = {
  positive: "Positive",
  info: "Info",
  warning: "Warning",
  important: "Important",
  critical: "Critical",
};

export default function SeverityBadge({ severity }: { severity: FeedSeverity }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${SEVERITY_STYLES[severity]}`}>
      {SEVERITY_LABELS[severity]}
    </span>
  );
}
