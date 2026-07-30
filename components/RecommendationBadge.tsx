import { Badge } from "@/components/ui/badge";
import type { RecommendationPriority } from "@/types/recommendation";

const PRIORITY_VARIANT: Record<RecommendationPriority, "secondary" | "info" | "warning" | "destructive"> = {
  low: "secondary",
  medium: "info",
  high: "warning",
  critical: "destructive",
};

const PRIORITY_LABELS: Record<RecommendationPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export default function RecommendationBadge({
  priority,
}: {
  priority: RecommendationPriority;
}) {
  return <Badge variant={PRIORITY_VARIANT[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}
