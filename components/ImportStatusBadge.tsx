import { Badge } from "@/components/ui/badge";

export type ImportStatus = "processed" | "duplicate" | "imported" | "skipped" | "rejected" | "failed";

const STATUS_VARIANT: Record<ImportStatus, "info" | "warning" | "success" | "secondary" | "destructive"> = {
  processed: "info",
  duplicate: "warning",
  imported: "success",
  skipped: "secondary",
  rejected: "secondary",
  failed: "destructive",
};

/** Shared status pill for anything flowing through an import/review
 * pipeline (documents, emails) — Document and Email records both use this
 * exact same status set. */
export default function ImportStatusBadge({ status }: { status: ImportStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className="capitalize">
      {status}
    </Badge>
  );
}
