function style(confidence: number): string {
  if (confidence >= 0.8) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (confidence >= 0.5) return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "bg-destructive/10 text-destructive";
}

export default function OCRConfidenceBadge({ confidence, label = "Confidence" }: { confidence: number; label?: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${style(confidence)}`}>
      {label} {Math.round(confidence * 100)}%
    </span>
  );
}
