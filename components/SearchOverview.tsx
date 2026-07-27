"use client";

import { useEffect, useMemo, useState } from "react";
import RecentSearches from "@/components/RecentSearches";
import SearchBar from "@/components/SearchBar";
import SearchFilters, { emptySearchFilterState, type SearchFilterState } from "@/components/SearchFilters";
import SearchResultCard from "@/components/SearchResultCard";
import SearchStatistics from "@/components/SearchStatistics";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  addRecentSearch,
  clearRecentSearches,
  deleteRecentSearch,
  getMostSearchedTerms,
  getRecentSearches,
  getTotalSearchCount,
  togglePinSearch,
} from "@/lib/index/registry";
import { detectRecurringTransactions } from "@/lib/recurring/engine";
import { getTransactions } from "@/lib/storage";
import { generateTimeline } from "@/lib/timeline/engine";
import { getAllRuns } from "@/lib/workflows/engine";
import { INDEX_OBJECT_TYPES } from "@/types/index";
import type { FinancialIndex, RecentSearch, SearchResult } from "@/types/index";
import type { ExplanationContext } from "@/types/explanation";

const INDEX_OBJECT_TYPE_SET = new Set(INDEX_OBJECT_TYPES);

/**
 * Independently rebuilds everything the Financial Semantic Index draws
 * from — the same pure engines the Dashboard's Orchestrator calls, minus
 * the AI Coach step, which a search page has no reason to invoke. Mirrors
 * the pattern RecurringOverview.tsx already uses for its own client-side
 * recompute. Also generates explanations for everything so the index can
 * include them and each result card can offer "Why?" without a further
 * round-trip.
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

function toSearchOptions(query: string, state: SearchFilterState) {
  const amountMin = state.amountMin.trim() ? Number(state.amountMin) : undefined;
  const amountMax = state.amountMax.trim() ? Number(state.amountMax) : undefined;
  return {
    query,
    sortBy: state.sortBy,
    filters: {
      types: state.types.length > 0 ? state.types : undefined,
      category: state.category === "all" ? undefined : state.category,
      merchant: state.merchant.trim() || undefined,
      dateRange:
        state.dateStart && state.dateEnd ? { start: state.dateStart, end: state.dateEnd } : undefined,
      amountRange:
        amountMin !== undefined || amountMax !== undefined ? { min: amountMin, max: amountMax } : undefined,
    },
  };
}

export default function SearchOverview() {
  const [index, setIndex] = useState<FinancialIndex | null>(null);
  const [explanationContext, setExplanationContext] = useState<ExplanationContext | null>(null);
  const [query, setQuery] = useState("");
  const [filterState, setFilterState] = useState<SearchFilterState>(emptySearchFilterState());
  const [result, setResult] = useState<SearchResult | null>(null);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  useEffect(() => {
    const built = buildIndexFromStorage();
    setIndex(built.index);
    setExplanationContext(built.explanationContext);
    setRecentSearches(getRecentSearches());
  }, []);

  const categories = useMemo(() => {
    if (!index) return [];
    const set = new Set<string>();
    for (const obj of index.objects) {
      if (obj.category) set.add(obj.category);
    }
    return Array.from(set).sort();
  }, [index]);

  function runSearch(nextQuery: string, nextFilterState: SearchFilterState) {
    if (!index) return;
    const options = toSearchOptions(nextQuery, nextFilterState);
    const searchResult = searchFinancialIndex(index, options);
    setResult(searchResult);
    setRecentSearches(addRecentSearch(nextQuery, options.filters, searchResult.totalMatches));
  }

  function handleSearch(nextQuery: string) {
    setQuery(nextQuery);
    runSearch(nextQuery, filterState);
  }

  function handleFilterChange(next: SearchFilterState) {
    setFilterState(next);
    runSearch(query, next);
  }

  function handleSelectRecent(search: RecentSearch) {
    setQuery(search.query);
    const restored: SearchFilterState = {
      ...emptySearchFilterState(),
      types: (search.filters?.types ?? []).filter((t) => INDEX_OBJECT_TYPE_SET.has(t)),
      category: search.filters?.category ?? "all",
      merchant: search.filters?.merchant ?? "",
      dateStart: search.filters?.dateRange?.start ?? "",
      dateEnd: search.filters?.dateRange?.end ?? "",
      amountMin: search.filters?.amountRange?.min?.toString() ?? "",
      amountMax: search.filters?.amountRange?.max?.toString() ?? "",
    };
    setFilterState(restored);
    runSearch(search.query, restored);
  }

  const stats = useMemo(() => {
    if (!index) return null;
    const countsByType = Object.fromEntries(INDEX_OBJECT_TYPES.map((t) => [t, index.counts[t] ?? 0])) as Record<
      (typeof INDEX_OBJECT_TYPES)[number],
      number
    >;
    return {
      totalIndexedObjects: index.objects.length,
      countsByType,
      totalSearches: getTotalSearchCount(),
      mostSearchedTerms: getMostSearchedTerms(),
    };
    // recentSearches is a re-render trigger, not a data source: search term
    // counts live in localStorage (lib/index/registry.ts), so this needs to
    // recompute whenever a new search is recorded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, recentSearches]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <SearchBar initialQuery={query} onSearch={handleSearch} />
        <SearchFilters state={filterState} categories={categories} onChange={handleFilterChange} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Results</h2>
          {result && (
            <span className="text-muted-foreground text-sm">{result.totalMatches} match(es)</span>
          )}
        </div>
        {!result || result.items.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {index ? "Search or apply a filter to see results." : "Loading index…"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {result.items.map((item) => (
              <SearchResultCard
                key={`${item.object.type}:${item.object.id}`}
                item={item}
                explanationContext={explanationContext ?? undefined}
              />
            ))}
          </div>
        )}
      </div>

      <RecentSearches
        searches={recentSearches}
        onSelect={handleSelectRecent}
        onDelete={(id) => setRecentSearches(deleteRecentSearch(id))}
        onTogglePin={(id) => setRecentSearches(togglePinSearch(id))}
        onClear={() => setRecentSearches(clearRecentSearches())}
      />

      {stats && <SearchStatistics stats={stats} />}
    </div>
  );
}
