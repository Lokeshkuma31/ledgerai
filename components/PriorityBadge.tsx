const TONE_STYLES = {
  critical: "bg-destructive/10 text-destructive",
  high: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  medium: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  low: "bg-muted text-muted-foreground",
};

function toneFor(priority: number): keyof typeof TONE_STYLES {
  if (priority >= 90) return "critical";
  if (priority >= 70) return "high";
  if (priority >= 40) return "medium";
  return "low";
}

export default function PriorityBadge({ priority }: { priority: number }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${TONE_STYLES[toneFor(priority)]}`}>
      Priority {priority}
    </span>
  );
}
