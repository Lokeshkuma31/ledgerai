import { Badge } from "@/components/ui/badge";

export default function MerchantKnowledgeBadge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "muted";
}) {
  return <Badge variant={tone === "muted" ? "secondary" : "ai"}>{label}</Badge>;
}
