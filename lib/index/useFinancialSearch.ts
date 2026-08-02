"use client";

import { useEffect, useState } from "react";
import { calculateBudgetStatus } from "@/lib/budget/engine";
import { getBudgets } from "@/lib/budget/storage";
import { generateRecommendations } from "@/lib/decision/engine";
import { applyPersistedStatus } from "@/lib/decision/storage";
import { detectFinancialEvents } from "@/lib/events/engine";
import { explainAll } from "@/lib/explanations/engine";
import { generateForecast } from "@/lib/forecast/engine";
import { computeForecastStatistics } from "@/lib/forecast/statistics";
import { generateInsights } from "@/lib/insights/engine";
import { buildFinancialIndex, searchFinancialIndex } from "@/lib/index";
import { getAllMerchantProfiles } from "@/lib/merchant/knowledge";
import { getAllMerchants } from "@/lib/merchant/registry";
import { getHistory } from "@/lib/query/history";
import { detectRecurringTransactions } from "@/lib/recurring/engine";
import { getTransactions } from "@/lib/storage";
import { generateTimeline } from "@/lib/timeline/engine";
import { getAllRuns } from "@/lib/workflows/engine";
import type { ExplanationContext } from "@/types/explanation";
import type { FinancialIndex, IndexedObject, SearchOptions, SearchResult } from "@/types/index";

/**
 * Independently rebuilds everything the Financial Semantic Index draws
 * from — the same pure engines the Dashboard's Orchestrator calls, minus
 * the AI Coach step, which search has no reason to invoke. Originally lived
 * inline in SearchOverview.tsx; moved here so Cmd+K (CommandPalette.tsx)
 * can share the exact same index and ranking instead of building its own,
 * which would let the two surfaces' results drift apart over time.
 */
function buildIndexFromStorage(): { index: FinancialIndex; explanationContext: ExplanationContext } {
  const now = new Date();
  const transactions = getTransactions();
  const merchants = getAllMerchants();
  const merchantProfiles = getAllMerchantProfiles();
  const rawBudgets = getBudgets();
  const budgets = calculateBudgetStatus(rawBudgets, transactions, now);
  const insights = generateInsights(transactions);
  const timeline = generateTimeline(transactions, now);
  const recurringReconciliation = detectRecurringTransactions(transactions, merchantProfiles, now);
  const recurring = recurringReconciliation.items;
  const forecast = generateForecast(transactions, recurring, budgets, insights, timeline, now);
  const forecastStatistics = computeForecastStatistics(forecast, transactions, now);
  const events = detectFinancialEvents(transactions, {
    budgetStatuses: budgets,
    recurring: recurringReconciliation,
    forecast: { forecast, statistics: forecastStatistics },
    now,
  });
  const recommendations = applyPersistedStatus(
    generateRecommendations({ transactions, budgets: rawBudgets, events, insights, timeline, now }),
  );
  const conversationHistory = getHistory();

  const explanationContext: ExplanationContext = {
    transactions,
    budgets,
    events,
    recommendations,
    recurring,
    merchantProfiles,
    forecast,
    insights,
    timeline,
    now,
  };
  const explanations = explainAll(explanationContext);

  const index = buildFinancialIndex({
    transactions,
    merchants,
    merchantProfiles,
    insights,
    timeline,
    budgets,
    events,
    recommendations,
    recurring,
    forecast,
    conversationHistory,
    explanations,
    workflowRuns: getAllRuns(),
    now,
  });

  return { index, explanationContext };
}

export interface FinancialSearchIndex {
  index: FinancialIndex | null;
  explanationContext: ExplanationContext | null;
}

/** Builds the index once per mount — both CommandPalette and SearchOverview
 * call this independently, so each surface gets a fresh index reflecting
 * whatever's in storage when it opens/loads (buildFinancialIndex's own
 * signature cache, see lib/index/index.ts, keeps repeat calls within the
 * same session cheap when nothing relevant changed). */
export function useFinancialSearchIndex(): FinancialSearchIndex {
  const [index, setIndex] = useState<FinancialIndex | null>(null);
  const [explanationContext, setExplanationContext] = useState<ExplanationContext | null>(null);

  useEffect(() => {
    const built = buildIndexFromStorage();
    setIndex(built.index);
    setExplanationContext(built.explanationContext);
  }, []);

  return { index, explanationContext };
}

const TYPE_HREF_PREFIX: Record<string, string> = {
  transaction: "/transactions",
  merchant: "/merchants",
  "merchant-profile": "/merchants",
  category: "/insights",
  "timeline-entry": "/dashboard",
  budget: "/budgets",
  "financial-event": "/insights",
  recommendation: "/ai-coach",
  "recurring-transaction": "/recurring",
  "forecast-summary": "/forecast",
  conversation: "/ai-coach",
  explanation: "/insights",
  workflow: "/workflows",
  "bank-account": "/banks",
  "bank-institution": "/banks",
  "bank-sync-run": "/banks",
  consent: "/connections",
  document: "/documents",
  email: "/email",
  connection: "/connections",
  "sync-job": "/sync",
  settings: "/settings",
};

/**
 * Resolves where a Cmd+K result should navigate. Merchants/merchant
 * profiles have a real per-id detail route today, so they link there
 * directly; every other type routes to its section page (most don't have
 * a per-id detail route yet — see the design spec's Detail Pages phase).
 * Settings entries carry their own href in metadata since they don't map
 * to a single section route.
 */
export function resolveIndexObjectHref(object: IndexedObject): string {
  if (object.type === "settings" && typeof object.metadata.href === "string") {
    return object.metadata.href;
  }
  if (object.type === "merchant" || object.type === "merchant-profile") {
    return `/merchants/${object.id}`;
  }
  return TYPE_HREF_PREFIX[object.type] ?? "/search";
}

export function search(index: FinancialIndex, options: SearchOptions, now?: Date): SearchResult {
  return searchFinancialIndex(index, options, now);
}
