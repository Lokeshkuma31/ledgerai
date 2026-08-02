import AICoachCard from "@/components/AICoachCard";
import QueryInput from "@/components/QueryInput";
import QueryResultCard from "@/components/QueryResult";
import SuggestedQuestions from "@/components/SuggestedQuestions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoachOutput } from "@/lib/coach/coach";
import type { QueryResult } from "@/types/query";

/**
 * The workspace's center stage — the proactive Coach summary (reused
 * as-is from AICoachCard) above the live question/answer surface, promoted
 * to the primary focus area rather than sharing equal width with it the
 * way the old two-panel layout did.
 */
export default function AiCoachConversation({
  coachSummary,
  history,
  pending,
  error,
  suggestions,
  onAsk,
  onDelete,
}: {
  coachSummary: CoachOutput | null;
  history: QueryResult[];
  pending: boolean;
  error: string | null;
  suggestions: string[];
  onAsk: (question: string) => void;
  onDelete: (id: string) => void;
}) {
  const latest = history[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <AICoachCard summary={coachSummary} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ask Your Financial Copilot</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <QueryInput onSubmit={onAsk} pending={pending} />
          {error && <p className="text-destructive text-sm">{error}</p>}

          {latest ? (
            <QueryResultCard result={latest} onDelete={onDelete} />
          ) : (
            <div className="flex flex-col gap-3 py-4">
              <p className="text-muted-foreground text-sm">
                Ask about spending, forecasts, or budgets to get started.
              </p>
              <SuggestedQuestions questions={suggestions} onSelect={onAsk} disabled={pending} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
