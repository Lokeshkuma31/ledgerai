import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CoachSummary from "@/components/CoachSummary";
import CoachSuggestions from "@/components/CoachSuggestions";
import type { CoachOutput } from "@/lib/coach/coach";

/**
 * Pure presentation. The Financial Intelligence Orchestrator already
 * resolved (or failed to resolve) the coach summary before this renders —
 * there is no fetching, caching, or loading state left to manage here.
 */
export default function AICoachCard({
  summary,
}: {
  summary: CoachOutput | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Financial Coach</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {summary ? (
          <>
            <CoachSummary summary={summary.summary} />
            <CoachSuggestions
              goodHabits={summary.goodHabits}
              watchOutFor={summary.watchOutFor}
              suggestions={summary.suggestions}
            />
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Unable to generate insights right now.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
