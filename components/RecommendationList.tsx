import { Card, CardContent } from "@/components/ui/card";
import RecommendationCard from "@/components/RecommendationCard";
import type { ExplanationContext } from "@/types/explanation";
import type { Recommendation } from "@/types/recommendation";

export default function RecommendationList({
  recommendations,
  onDismiss,
  onComplete,
  explanationContext,
}: {
  recommendations: Recommendation[];
  onDismiss: (recommendation: Recommendation) => void;
  onComplete: (recommendation: Recommendation) => void;
  explanationContext?: ExplanationContext;
}) {
  if (recommendations.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">
            No recommendations right now.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {recommendations.map((recommendation) => (
        <RecommendationCard
          key={recommendation.id}
          recommendation={recommendation}
          onDismiss={onDismiss}
          onComplete={onComplete}
          explanationContext={explanationContext}
        />
      ))}
    </div>
  );
}
