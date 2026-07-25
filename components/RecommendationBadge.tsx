import type { RecommendationPriority } from "@/types/recommendation";

const PRIORITY_STYLES: Record<RecommendationPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  high: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  critical: "bg-destructive/10 text-destructive",
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
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${PRIORITY_STYLES[priority]}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
