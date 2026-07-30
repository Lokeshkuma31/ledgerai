import { Badge } from "@/components/ui/badge";
import type { SyncJobStatus } from "@/lib/sync/types";

const STATUS_VARIANT: Record<SyncJobStatus, "secondary" | "info" | "warning" | "success" | "destructive"> = {
  queued: "secondary",
  running: "info",
  paused: "warning",
  completed: "success",
  partial: "warning",
  failed: "destructive",
  cancelled: "secondary",
};

export default function SyncJobStatusBadge({ status }: { status: SyncJobStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}
