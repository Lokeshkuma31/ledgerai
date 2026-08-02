import { Badge } from "@/components/ui/badge";
import type { ClassificationSource } from "@/types/transaction";

/** "Learned" (from a prior user correction, via lib/ai/memory) vs. "AI"
 * (the classifier's own guess) — extracted from TransactionCard.tsx so the
 * new transaction detail page can reuse the exact same badge instead of a
 * second implementation. */
export default function ClassificationSourceBadge({ source }: { source: ClassificationSource }) {
  return <Badge variant={source === "memory" ? "success" : "secondary"}>{source === "memory" ? "Learned" : "AI"}</Badge>;
}
