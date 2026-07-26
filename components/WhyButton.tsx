"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import ExplanationPanel from "@/components/ExplanationPanel";
import type { Explanation } from "@/types/explanation";

/** Generates its explanation lazily — the thunk only runs the first time
 * the panel is opened, so cards that are never explained never pay the
 * (cheap, but non-zero) cost of building one. */
export default function WhyButton({ explain }: { explain: () => Explanation }) {
  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && !explanation) setExplanation(explain());
  }

  return (
    <>
      <Button variant="ghost" size="xs" onClick={() => handleOpenChange(true)}>
        Explain
      </Button>
      <ExplanationPanel explanation={explanation} open={open} onOpenChange={handleOpenChange} />
    </>
  );
}
