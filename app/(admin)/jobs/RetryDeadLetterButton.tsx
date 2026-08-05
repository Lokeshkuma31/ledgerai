"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { retryDeadLetterAction } from "./actions";

export function RetryDeadLetterButton({ deadLetterId }: { deadLetterId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => startTransition(() => retryDeadLetterAction(deadLetterId))}
    >
      {isPending ? "Retrying…" : "Retry"}
    </Button>
  );
}
