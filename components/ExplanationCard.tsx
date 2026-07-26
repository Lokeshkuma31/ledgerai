import ConfidenceBadge from "@/components/ConfidenceBadge";
import EvidenceList from "@/components/EvidenceList";
import type { Explanation } from "@/types/explanation";

export default function ExplanationCard({ explanation }: { explanation: Explanation }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{explanation.title}</h3>
        <ConfidenceBadge confidence={explanation.confidence} />
      </div>
      <p className="text-muted-foreground text-sm">{explanation.summary}</p>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">Reason</span>
        <p className="text-sm">{explanation.reason}</p>
      </div>
      {explanation.supportingEvidence.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium">Supporting Evidence</span>
          <EvidenceList evidence={explanation.supportingEvidence} />
        </div>
      )}
      {explanation.relatedObjects.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium">Related Data</span>
          <div className="flex flex-wrap gap-1">
            {explanation.relatedObjects.map((related) => (
              <span
                key={`${related.type}:${related.id}`}
                className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs"
              >
                {related.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
