import { Card, CardContent } from "@/components/ui/card";
import RecommendationCard from "@/components/RecommendationCard";
import type { Recommendation } from "@/types/recommendation";

export default function RecommendationList({
  recommendations,
  onDismiss,
  onComplete,
}: {
  recommendations: Recommendation[];
  onDismiss: (recommendation: Recommendation) => void;
  onComplete: (recommendation: Recommendation) => void;
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
        />
      ))}
    </div>
  );
}
