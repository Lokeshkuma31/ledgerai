"use client";

import { Card, CardContent } from "@/components/ui/card";
import CompletedRecommendations from "@/components/CompletedRecommendations";
import { useDashboard } from "@/components/DashboardProvider";
import IntelligenceFeed from "@/components/IntelligenceFeed";
import { useExplanationContext } from "@/hooks/use-explanation-context";

export default function FeedPageContent() {
  const { state, refresh } = useDashboard();
  const explanationContext = useExplanationContext(state);

  if (!state || !explanationContext) {
    return <p className="text-muted-foreground py-16 text-center">Loading your feed...</p>;
  }

  if (state.dashboardStats.totalTransactions === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">No feed items yet.</p>
        </CardContent>
      </Card>
    );
  }

  const completedRecommendations = state.recommendations.filter((r) => r.status === "completed");

  return (
    <div className="flex flex-col gap-4">
      <IntelligenceFeed
        items={state.feed}
        now={new Date(state.generatedAt)}
        explanationContext={explanationContext}
        notificationCandidates={state.notificationCandidates}
        onChange={refresh}
      />
      <CompletedRecommendations recommendations={completedRecommendations} />
    </div>
  );
}
