import { Badge } from "@/components/ui/badge";

function toneFor(priority: number): "destructive" | "warning" | "info" | "secondary" {
  if (priority >= 90) return "destructive";
  if (priority >= 70) return "warning";
  if (priority >= 40) return "info";
  return "secondary";
}

export default function PriorityBadge({ priority }: { priority: number }) {
  return <Badge variant={toneFor(priority)}>Priority {priority}</Badge>;
}
