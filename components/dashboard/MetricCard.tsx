import { buildSparkline } from "@/lib/charts";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<"up" | "down" | "neutral", string> = {
  up: "text-success",
  down: "text-destructive",
  neutral: "text-muted-foreground",
};

const COLOR_STROKE: Record<"primary" | "ai" | "success" | "warning", string> = {
  primary: "var(--primary)",
  ai: "var(--ai)",
  success: "var(--success)",
  warning: "var(--warning)",
};

export default function MetricCard({
  label,
  value,
  badgeText,
  badgeTone = "neutral",
  sparklineValues,
  color = "primary",
}: {
  label: string;
  value: string;
  badgeText?: string;
  badgeTone?: "up" | "down" | "neutral";
  sparklineValues?: number[];
  color?: "primary" | "ai" | "success" | "warning";
}) {
  const spark = sparklineValues && sparklineValues.length >= 2 ? buildSparkline(sparklineValues, 240, 48) : null;
  const strokeColor = COLOR_STROKE[color];

  return (
    <div className="bg-card border-border hover:border-primary/40 relative overflow-hidden rounded-2xl border px-4 pt-4 transition-colors">
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      <div className="font-numeric mt-1.5 text-2xl font-semibold tracking-tight">{value}</div>
      {badgeText && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={cn("text-xs font-semibold", TONE_CLASSES[badgeTone])}>{badgeText}</span>
        </div>
      )}
      <div className="mt-2.5 h-[48px]">
        {spark && spark.line ? (
          <svg viewBox="0 0 240 48" preserveAspectRatio="none" className="block h-full w-full">
            <defs>
              <linearGradient id={`spark-${label.replace(/\s+/g, "-")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={strokeColor} stopOpacity={0.28} />
                <stop offset="1" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={spark.area} fill={`url(#spark-${label.replace(/\s+/g, "-")})`} />
            <path d={spark.line} fill="none" stroke={strokeColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </div>
    </div>
  );
}
