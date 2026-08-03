import { ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCurrencyINR } from "@/lib/visualization/formatter";

/**
 * The ₹/en-IN tooltip formatter already duplicated inline in
 * CashFlowChart.tsx and MerchantSpendChart.tsx, extracted so every new
 * chart shares one formatting rule instead of re-typing it.
 */
export default function FinancialTooltip({ config }: { config: ChartConfig }) {
  return (
    <ChartTooltipContent
      formatter={(value, name) => [
        formatCurrencyINR(Number(value)),
        ` ${config[name as keyof typeof config]?.label ?? name}`,
      ]}
    />
  );
}
