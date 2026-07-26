"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ExplanationCard from "@/components/ExplanationCard";
import type { Explanation } from "@/types/explanation";

export default function ExplanationPanel({
  explanation,
  open,
  onOpenChange,
}: {
  explanation: Explanation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Why?</DialogTitle>
        </DialogHeader>
        {explanation ? (
          <ExplanationCard explanation={explanation} />
        ) : (
          <p className="text-muted-foreground text-sm">Generating explanation…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
