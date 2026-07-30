import { Badge } from "@/components/ui/badge";
import type { FinancialEventSeverity } from "@/types/event";

const SEVERITY_VARIANT: Record<FinancialEventSeverity, "secondary" | "warning" | "info" | "destructive"> = {
  info: "secondary",
  warning: "warning",
  important: "info",
  critical: "destructive",
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
  return <Badge variant={SEVERITY_VARIANT[severity]}>{SEVERITY_LABELS[severity]}</Badge>;
}
