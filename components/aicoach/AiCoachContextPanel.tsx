"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ForecastCard from "@/components/ForecastCard";
import RecommendationCard from "@/components/RecommendationCard";
import { getPinnedInsightIds, togglePinnedInsight } from "@/lib/coach/pinnedInsights";
import { getAllMerchantProfiles } from "@/lib/merchant/knowledge";
import { getTransactions } from "@/lib/storage";
import type { ExplanationContext } from "@/types/explanation";
import type { FinancialState } from "@/types/financial-state";

/**
 * The workspace's persistent left rail — current forecast, pinned
 * insights, and recent decisions, always visible so the conversation on
 * the right never loses its surrounding financial context.
 */
export default function AiCoachContextPanel({ state }: { state: FinancialState }) {
  const [explanationContext, setExplanationContext] = useState<ExplanationContext | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  useEffect(() => {
    setPinnedIds(getPinnedInsightIds());
    setExplanationContext({
      transactions: getTransactions(),
      budgets: state.budgets,
      events: state.events,
      recommendations: state.recommendations,
      recurring: state.recurring,
      merchantProfiles: getAllMerchantProfiles(),
      forecast: state.forecast,
      insights: state.insights,
      timeline: state.timeline,
      now: new Date(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.generatedAt]);

  function handleTogglePin(id: string) {
    setPinnedIds(togglePinnedInsight(id));
  }

  const pinnedRecommendations = useMemo(
    () => state.recommendations.filter((r) => pinnedIds.includes(r.id)),
    [state.recommendations, pinnedIds],
  );

  const recentDecisions = useMemo(
    () => state.recommendations.filter((r) => r.status !== "new").slice(0, 5),
    [state.recommendations],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Forecast Snapshot
        </h2>
        {explanationContext && <ForecastCard forecast={state.forecast} explanationContext={explanationContext} />}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Pinned Insights
        </h2>
        {pinnedRecommendations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing pinned yet — pin a recommendation to keep it in view here.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {pinnedRecommendations.map((rec) => (
              <RecommendationCard
                key={rec.id}
                recommendation={rec}
                pinned
                onTogglePin={handleTogglePin}
              />
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Decisions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentDecisions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No recommendations acted on yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {recentDecisions.map((rec) => (
                <div key={rec.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{rec.title}</span>
                  <Badge variant={rec.status === "completed" ? "success" : "secondary"}>
                    {rec.status === "completed" ? "Completed" : "Dismissed"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
