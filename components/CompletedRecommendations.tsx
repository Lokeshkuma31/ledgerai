import { Card, CardContent } from "@/components/ui/card";
import type { Recommendation } from "@/types/recommendation";

export default function CompletedRecommendations({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  if (recommendations.length === 0) return null;

  return (
    <details className="group">
      <summary className="text-muted-foreground cursor-pointer text-sm font-medium select-none">
        Completed ({recommendations.length})
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {recommendations.map((recommendation) => (
          <Card key={recommendation.id} size="sm" className="opacity-70">
            <CardContent className="flex flex-col gap-1">
              <span className="text-sm font-medium line-through">
                {recommendation.title}
              </span>
              <p className="text-muted-foreground text-xs">
                {recommendation.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </details>
  );
}
