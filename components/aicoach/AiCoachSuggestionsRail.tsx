"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ConversationHistory from "@/components/ConversationHistory";
import SuggestedQuestions from "@/components/SuggestedQuestions";
import type { QueryResult } from "@/types/query";

/**
 * The workspace's collapsible right rail — a quick way to re-ask a
 * suggested question or revisit conversation history without those two
 * lists competing with the live conversation for center-stage attention.
 */
export default function AiCoachSuggestionsRail({
  suggestions,
  onSelect,
  pending,
  history,
  onDelete,
  onClear,
}: {
  suggestions: string[];
  onSelect: (question: string) => void;
  pending: boolean;
  history: QueryResult[];
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-base">Ask &amp; Recall</CardTitle>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="animate-in fade-in-0 slide-in-from-top-1 flex flex-col gap-4 duration-200">
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs font-medium">Suggested Questions</span>
            <SuggestedQuestions questions={suggestions} onSelect={onSelect} disabled={pending} />
          </div>
          <ConversationHistory history={history} onDelete={onDelete} onClear={onClear} />
        </CardContent>
      )}
    </Card>
  );
}
