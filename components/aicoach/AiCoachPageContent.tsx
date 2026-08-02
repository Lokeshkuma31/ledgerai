"use client";

import { useState } from "react";
import { useDashboard } from "@/components/DashboardProvider";
import AiCoachContextPanel from "@/components/aicoach/AiCoachContextPanel";
import AiCoachConversation from "@/components/aicoach/AiCoachConversation";
import AiCoachSuggestionsRail from "@/components/aicoach/AiCoachSuggestionsRail";
import { getAllMerchantProfiles } from "@/lib/merchant/knowledge";
import { getAllMerchants } from "@/lib/merchant/registry";
import { answerQuery } from "@/lib/query/engine";
import { addToHistory, clearHistory, deleteFromHistory, getHistory } from "@/lib/query/history";
import { generateSuggestions } from "@/lib/query/suggestions";
import { getTransactions } from "@/lib/storage";
import type { QueryResult } from "@/types/query";

/**
 * The AI Coach Workspace — three columns instead of the old two
 * side-by-side panels: a persistent context rail (forecast, pinned
 * insights, recent decisions), the live conversation promoted to the
 * center, and a collapsible rail for suggested questions + history.
 *
 * Scope note: conversation history is persisted (lib/query/history.ts) and
 * shown here, but lib/query/engine.ts's answerQuery does not feed prior
 * turns back into the LLM prompt — each question is still answered
 * independently. That's an existing behavior, unchanged by this redesign;
 * the workspace surfaces history for the user's own recall, not as a
 * claim that the AI remembers earlier turns.
 */
export default function AiCoachPageContent() {
  const { state } = useDashboard();
  const [history, setHistory] = useState<QueryResult[]>(() => getHistory());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!state) {
    return <p className="text-muted-foreground py-16 text-center">Loading your AI coach...</p>;
  }

  // Narrowed once here so the async handleAsk closure below (which TS
  // can't otherwise re-narrow across a function boundary) can rely on it
  // being non-null too.
  const financialState = state;

  const suggestions = generateSuggestions({
    hasTransactions: financialState.dashboardStats.totalTransactions > 0,
    hasBudgets: financialState.budgets.length > 0,
    hasSubscriptions: financialState.recurring.some((r) => r.isSubscription),
  });

  async function handleAsk(question: string) {
    setPending(true);
    setError(null);
    try {
      const result = await answerQuery(question, {
        transactions: getTransactions(),
        merchants: getAllMerchants(),
        merchantProfiles: getAllMerchantProfiles(),
        insights: financialState.insights,
        timeline: financialState.timeline,
        budgets: financialState.budgets,
        recurring: financialState.recurring,
        events: financialState.events,
        recommendations: financialState.recommendations,
        forecast: financialState.forecast,
        conversationHistory: history,
        now: new Date(),
      });
      setHistory(addToHistory(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[0.9fr_1.4fr_1fr]">
      <AiCoachContextPanel state={financialState} />
      <AiCoachConversation
        coachSummary={financialState.coachSummary}
        history={history}
        pending={pending}
        error={error}
        suggestions={suggestions}
        onAsk={handleAsk}
        onDelete={(id) => setHistory(deleteFromHistory(id))}
      />
      <AiCoachSuggestionsRail
        suggestions={suggestions}
        onSelect={handleAsk}
        pending={pending}
        history={history}
        onDelete={(id) => setHistory(deleteFromHistory(id))}
        onClear={() => setHistory(clearHistory())}
      />
    </div>
  );
}
