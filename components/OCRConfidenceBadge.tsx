import { Badge } from "@/components/ui/badge";

function toneFor(confidence: number): "success" | "warning" | "destructive" {
  if (confidence >= 0.8) return "success";
  if (confidence >= 0.5) return "warning";
  return "destructive";
}

export default function OCRConfidenceBadge({ confidence, label = "Confidence" }: { confidence: number; label?: string }) {
  return (
    <Badge variant={toneFor(confidence)}>
      {label} {Math.round(confidence * 100)}%
    </Badge>
  );
}
