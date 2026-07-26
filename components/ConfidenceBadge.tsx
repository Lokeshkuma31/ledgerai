const TONE_STYLES = {
  high: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  low: "bg-muted text-muted-foreground",
};

function toneFor(confidence: number): keyof typeof TONE_STYLES {
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.7) return "medium";
  return "low";
}

export default function ConfidenceBadge({ confidence }: { confidence: number }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${TONE_STYLES[toneFor(confidence)]}`}>
      {Math.round(confidence * 100)}% confidence
    </span>
  );
}
