import { ReferenceLine } from "recharts";
import type { AnnotationMarker as AnnotationMarkerData } from "@/lib/visualization/annotations";
import type { FinancialEventSeverity } from "@/types/event";

const SEVERITY_COLOR: Record<FinancialEventSeverity, string> = {
  info: "var(--muted-foreground)",
  warning: "var(--warning)",
  important: "var(--primary)",
  critical: "var(--destructive)",
};

/**
 * Renders projected FinancialEvent annotations (lib/visualization/
 * annotations.ts) as Recharts ReferenceLines. Since the charts this feeds
 * (CashFlowSeriesChart) bucket by month while events carry an exact date,
 * each marker is resolved to the month-bucketed point's own `label` (the
 * value the chart's XAxis actually renders) rather than assuming the raw
 * date string matches an axis tick.
 */
export default function AnnotationMarkers({
  markers,
  data,
}: {
  markers: AnnotationMarkerData[];
  data: { month: string; label: string }[];
}) {
  return (
    <>
      {markers.map((marker) => {
        const point = data.find((d) => d.month === marker.month);
        if (!point) return null;
        return (
          <ReferenceLine
            key={marker.id}
            x={point.label}
            stroke={SEVERITY_COLOR[marker.severity]}
            strokeDasharray="3 3"
            label={{ value: marker.label, position: "insideTopRight", fontSize: 10, fill: SEVERITY_COLOR[marker.severity] }}
          />
        );
      })}
    </>
  );
}
