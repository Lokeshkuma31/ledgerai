import { useMemo } from "react";
import { getTransactions } from "@/lib/storage";
import { getAllMerchantProfiles } from "@/lib/merchant/knowledge";
import type { ExplanationContext } from "@/types/explanation";
import type { FinancialState } from "@/types/financial-state";

/**
 * Builds the ExplanationContext every "Why?" button needs — the
 * Explanation Engine never calls storage itself, so this is the one place
 * per page that assembles its context. Shared across every
 * FinancialState-consuming page (Dashboard, Budgets, Forecast, Insights,
 * Feed) instead of re-inlining the same object on each one.
 */
export function useExplanationContext(
  state: FinancialState | null,
): ExplanationContext | null {
  return useMemo(() => {
    if (!state) return null;
    return {
      transactions: getTransactions(),
      budgets: state.budgets,
      events: state.events,
      recommendations: state.recommendations,
      recurring: state.recurring,
      merchantProfiles: getAllMerchantProfiles(),
      forecast: state.forecast,
      insights: state.insights,
      timeline: state.timeline,
      now: new Date(state.generatedAt),
    };
  }, [state]);
}
