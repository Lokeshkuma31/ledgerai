"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CoachSummary from "@/components/CoachSummary";
import CoachSuggestions from "@/components/CoachSuggestions";
import { generateFinancialSummary, type CoachOutput } from "@/lib/coach/coach";
import {
  computeCoachSignature,
  loadCoachCache,
  saveCoachCache,
} from "@/lib/coach/cache";
import { getMemoryEntries } from "@/lib/ai/memory";
import { generateInsights } from "@/lib/insights/engine";
import { generateTimeline } from "@/lib/timeline/engine";
import type { BudgetStatus } from "@/types/budget";
import type { FinancialEvent } from "@/types/event";
import type { Recommendation } from "@/types/recommendation";
import type { Transaction } from "@/types/transaction";

type Status = "idle" | "loading" | "error";

export default function AICoachCard({
  transactions,
  budgetStatuses,
  events,
  recommendations,
}: {
  transactions: Transaction[];
  budgetStatuses: BudgetStatus[];
  events: FinancialEvent[];
  recommendations: Recommendation[];
}) {
  const [output, setOutput] = useState<CoachOutput | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const inFlightSignature = useRef<string | null>(null);

  useEffect(() => {
    if (transactions.length === 0) {
      setOutput(null);
      return;
    }

    const memoryEntries = getMemoryEntries();
    const signature = computeCoachSignature(
      transactions,
      memoryEntries.length,
      budgetStatuses,
      recommendations.map((r) => r.id),
    );

    const cached = loadCoachCache();
    if (cached && cached.signature === signature) {
      setOutput(cached.response);
      setStatus("idle");
      return;
    }

    if (inFlightSignature.current === signature) return;
    inFlightSignature.current = signature;
    setStatus("loading");

    const reviewedCount = transactions.filter((t) => t.reviewed).length;

    generateFinancialSummary({
      insights: generateInsights(transactions),
      timeline: generateTimeline(transactions),
      recentTransactions: transactions.slice(0, 10),
      memoryStats: { totalEntries: memoryEntries.length },
      reviewStats: {
        totalTransactions: transactions.length,
        reviewedCount,
        pendingCount: transactions.length - reviewedCount,
      },
      budgetStatuses,
      events,
      recommendations,
    })
      .then((result) => {
        setOutput(result);
        setStatus("idle");
        saveCoachCache(signature, result);
      })
      .catch(() => {
        setStatus("error");
      })
      .finally(() => {
        inFlightSignature.current = null;
      });
  }, [transactions, budgetStatuses, events, recommendations]);

  if (transactions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Financial Coach</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {status === "loading" && (
          <p className="text-muted-foreground text-sm">
            Analyzing your spending...
          </p>
        )}
        {status === "error" && (
          <p className="text-muted-foreground text-sm">
            Unable to generate insights right now.
          </p>
        )}
        {status === "idle" && output && (
          <>
            <CoachSummary summary={output.summary} />
            <CoachSuggestions
              goodHabits={output.goodHabits}
              watchOutFor={output.watchOutFor}
              suggestions={output.suggestions}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
