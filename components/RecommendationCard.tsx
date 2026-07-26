import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import RecommendationBadge from "@/components/RecommendationBadge";
import WhyButton from "@/components/WhyButton";
import { explainRecommendation } from "@/lib/explanations/engine";
import type { ExplanationContext } from "@/types/explanation";
import type { Recommendation } from "@/types/recommendation";

export default function RecommendationCard({
  recommendation,
  onDismiss,
  onComplete,
  explanationContext,
}: {
  recommendation: Recommendation;
  onDismiss?: (recommendation: Recommendation) => void;
  onComplete?: (recommendation: Recommendation) => void;
  explanationContext?: ExplanationContext;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium">{recommendation.title}</span>
          <RecommendationBadge priority={recommendation.priority} />
        </div>
        <p className="text-sm">{recommendation.description}</p>
        <div className="text-muted-foreground flex flex-col gap-1 text-xs">
          <span>
            <span className="font-medium">Reason:</span>{" "}
            {recommendation.reason}
          </span>
          <span>
            <span className="font-medium">Suggested action:</span>{" "}
            {recommendation.action}
          </span>
        </div>
        {(onDismiss || onComplete || explanationContext) && (
          <div className="flex justify-end gap-2 pt-1">
            {explanationContext && (
              <WhyButton explain={() => explainRecommendation(recommendation, explanationContext)} />
            )}
            {onDismiss && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDismiss(recommendation)}
              >
                Dismiss
              </Button>
            )}
            {onComplete && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onComplete(recommendation)}
              >
                Mark Completed
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
