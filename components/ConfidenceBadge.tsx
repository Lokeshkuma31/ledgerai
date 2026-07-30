import { Badge } from "@/components/ui/badge";

function toneFor(confidence: number): "success" | "warning" | "secondary" {
  if (confidence >= 0.9) return "success";
  if (confidence >= 0.7) return "warning";
  return "secondary";
}

export default function ConfidenceBadge({ confidence }: { confidence: number }) {
  return <Badge variant={toneFor(confidence)}>{Math.round(confidence * 100)}% confidence</Badge>;
}
