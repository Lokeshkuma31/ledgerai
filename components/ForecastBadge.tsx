import { Badge } from "@/components/ui/badge";
import type { ForecastRiskLevel } from "@/types/forecast";

const RISK_VARIANT: Record<ForecastRiskLevel, "success" | "warning" | "destructive"> = {
  Safe: "success",
  Watch: "warning",
  "High Risk": "warning",
  Critical: "destructive",
};

export default function ForecastBadge({ riskLevel }: { riskLevel: ForecastRiskLevel }) {
  return <Badge variant={RISK_VARIANT[riskLevel]}>{riskLevel}</Badge>;
}
