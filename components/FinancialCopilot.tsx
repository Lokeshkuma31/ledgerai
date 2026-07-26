"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ConversationHistory from "@/components/ConversationHistory";
import QueryInput from "@/components/QueryInput";
import SuggestedQuestions from "@/components/SuggestedQuestions";
import { getAllMerchantProfiles } from "@/lib/merchant/knowledge";
import { getAllMerchants } from "@/lib/merchant/registry";
import { answerQuery } from "@/lib/query/engine";
import { addToHistory, clearHistory, deleteFromHistory, getHistory } from "@/lib/query/history";
import { generateSuggestions } from "@/lib/query/suggestions";
import { getTransactions } from "@/lib/storage";
import type { FinancialState } from "@/types/financial-state";
import type { QueryResult } from "@/types/query";

/**
 * The Dashboard's only job here is submitting the user's question — every
 * stage of actually answering it (intent detection, planning, execution,
 * context building, and the AI Coach call) lives in lib/query/engine.ts.
 */
export default function FinancialCopilot({ state }: { state: FinancialState }) {
  const [history, setHistory] = useState<QueryResult[]>(() => getHistory());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestions = generateSuggestions({
    hasTransactions: state.dashboardStats.totalTransactions > 0,
    hasBudgets: state.budgets.length > 0,
    hasSubscriptions: state.recurring.some((r) => r.isSubscription),
  });

  async function handleAsk(question: string) {
    setPending(true);
    setError(null);
    try {
      const result = await answerQuery(question, {
        transactions: getTransactions(),
        merchants: getAllMerchants(),
        merchantProfiles: getAllMerchantProfiles(),
        insights: state.insights,
        timeline: state.timeline,
        budgets: state.budgets,
        recurring: state.recurring,
        events: state.events,
        recommendations: state.recommendations,
        forecast: state.forecast,
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
    <Card>
      <CardHeader>
        <CardTitle>Ask Your Financial Copilot</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <QueryInput onSubmit={handleAsk} pending={pending} />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <SuggestedQuestions
          questions={suggestions}
          onSelect={handleAsk}
          disabled={pending}
        />
        <ConversationHistory
          history={history}
          onDelete={(id) => setHistory(deleteFromHistory(id))}
          onClear={() => setHistory(clearHistory())}
        />
      </CardContent>
    </Card>
  );
}
