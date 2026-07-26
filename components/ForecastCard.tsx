import { Card, CardContent } from "@/components/ui/card";
import WhyButton from "@/components/WhyButton";
import { explainForecast } from "@/lib/explanations/engine";
import type { CashFlowForecast } from "@/types/forecast";
import type { ExplanationContext } from "@/types/explanation";

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

export default function ForecastCard({
  forecast,
  explanationContext,
}: {
  forecast: CashFlowForecast;
  explanationContext: ExplanationContext;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat
            label="Projected Month-End Balance"
            value={formatAmount(forecast.projectedEndOfMonthBalance)}
          />
          <Stat label="Expected Income" value={formatAmount(forecast.expectedIncome)} />
          <Stat label="Expected Expenses" value={formatAmount(forecast.expectedExpenses)} />
          <Stat label="Expected Savings" value={formatAmount(forecast.expectedSavings)} />
          <Stat label="Daily Safe Spend" value={`${formatAmount(forecast.dailySafeSpend)}/day`} />
          <Stat label="Forecast Confidence" value={`${Math.round(forecast.confidence * 100)}%`} />
          <Stat label="Days Remaining" value={String(forecast.daysRemaining)} />
        </div>
        <div className="flex justify-end">
          <WhyButton explain={() => explainForecast(explanationContext)} />
        </div>
      </CardContent>
    </Card>
  );
}
