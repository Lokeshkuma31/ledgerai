/**
 * Shared display formatters — dedupes the ₹/en-IN formatting pattern
 * already duplicated inline in CashFlowChart.tsx and MerchantSpendChart.tsx.
 */

export function formatCurrencyINR(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(fractionDigits)}%`;
}
