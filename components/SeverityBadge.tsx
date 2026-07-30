import { Badge } from "@/components/ui/badge";
import type { FeedSeverity } from "@/types/feed";

const SEVERITY_VARIANT: Record<FeedSeverity, "success" | "secondary" | "warning" | "info" | "destructive"> = {
  positive: "success",
  info: "secondary",
  warning: "warning",
  important: "info",
  critical: "destructive",
};

const SEVERITY_LABELS: Record<FeedSeverity, string> = {
  positive: "Positive",
  info: "Info",
  warning: "Warning",
  important: "Important",
  critical: "Critical",
};

export default function SeverityBadge({ severity }: { severity: FeedSeverity }) {
  return <Badge variant={SEVERITY_VARIANT[severity]}>{SEVERITY_LABELS[severity]}</Badge>;
}
