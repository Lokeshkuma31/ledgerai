import { Badge } from "@/components/ui/badge";

export type RunStatus = "running" | "completed" | "partial" | "failed";

const STATUS_VARIANT: Record<RunStatus, "success" | "destructive" | "warning" | "info"> = {
  completed: "success",
  failed: "destructive",
  partial: "warning",
  running: "info",
};

/** Shared status pill for any completed/in-progress run — workflow runs,
 * bank sync runs, and email import runs all use this exact same status
 * set. */
export default function RunStatusBadge({ status }: { status: RunStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}
