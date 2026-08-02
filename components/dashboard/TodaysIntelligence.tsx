import { Card, CardContent } from "@/components/ui/card";
import RecommendationCard from "@/components/RecommendationCard";
import type { FeedItem } from "@/types/feed";
import type { Recommendation } from "@/types/recommendation";

function FeedHighlightCard({ item }: { item: FeedItem }) {
  return (
    <Card size="sm" className="from-ai/10 to-card border-ai/30 min-w-[240px] shrink-0 bg-gradient-to-br sm:min-w-[260px] sm:flex-1">
      <CardContent className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{item.title}</span>
        <p className="text-muted-foreground text-xs">{item.summary}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Distinct from Needs Attention (that's urgent; this is interesting) — AI
 * recommendations plus lower-severity Feed highlights (merchant insights,
 * trend changes), always present with a graceful empty state rather than
 * the old pattern of disappearing entirely when there was nothing new.
 */
export default function TodaysIntelligence({
  recommendations,
  feedHighlights,
}: {
  recommendations: Recommendation[];
  feedHighlights: FeedItem[];
}) {
  const hasContent = recommendations.length > 0 || feedHighlights.length > 0;

  if (!hasContent) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing new to highlight today — check back after your next sync or import.
      </p>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
      {recommendations.slice(0, 3).map((rec) => (
        <div key={rec.id} className="min-w-[240px] shrink-0 sm:min-w-[260px] sm:flex-1">
          <RecommendationCard recommendation={rec} />
        </div>
      ))}
      {feedHighlights.slice(0, 4).map((item) => (
        <FeedHighlightCard key={item.id} item={item} />
      ))}
    </div>
  );
}
