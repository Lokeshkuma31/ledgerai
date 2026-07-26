import type { ForecastRiskLevel } from "@/types/forecast";

const RISK_STYLES: Record<ForecastRiskLevel, string> = {
  Safe: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Watch: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "High Risk": "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  Critical: "bg-destructive/10 text-destructive",
};

export default function ForecastBadge({ riskLevel }: { riskLevel: ForecastRiskLevel }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${RISK_STYLES[riskLevel]}`}>
      {riskLevel}
    </span>
  );
}
