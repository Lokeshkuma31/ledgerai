"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelJobAction } from "../actions";

export function CancelJobButton({ jobRunId }: { jobRunId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="destructive"
      disabled={isPending}
      onClick={() => startTransition(() => cancelJobAction(jobRunId))}
    >
      {isPending ? "Cancelling…" : "Cancel"}
    </Button>
  );
}
