"use client";

import { useEffect, useMemo, useState } from "react";
import RecentSearches from "@/components/RecentSearches";
import SearchBar from "@/components/SearchBar";
import SearchFilters, { emptySearchFilterState, type SearchFilterState } from "@/components/SearchFilters";
import SearchResultCard from "@/components/SearchResultCard";
import SearchStatistics from "@/components/SearchStatistics";
import { Card, CardContent } from "@/components/ui/card";
import { search as searchFinancialIndex, useFinancialSearchIndex } from "@/lib/index/useFinancialSearch";
import {
  addRecentSearch,
  clearRecentSearches,
  deleteRecentSearch,
  getMostSearchedTerms,
  getRecentSearches,
  getTotalSearchCount,
  togglePinSearch,
} from "@/lib/index/registry";
import { INDEX_OBJECT_TYPES } from "@/types/index";
import type { RecentSearch, SearchResult } from "@/types/index";

const INDEX_OBJECT_TYPE_SET = new Set(INDEX_OBJECT_TYPES);

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

export default function SearchOverview({ initialQuery = "" }: { initialQuery?: string }) {
  const { index, explanationContext } = useFinancialSearchIndex();
  const [query, setQuery] = useState(initialQuery);
  const [filterState, setFilterState] = useState<SearchFilterState>(emptySearchFilterState());
  const [result, setResult] = useState<SearchResult | null>(null);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(() => getRecentSearches());

  // Runs the query Cmd+K's "See all results" handed off via ?q=, once the
  // index has finished building — a plain query-string prop, not a
  // committed search until the index exists to search against.
  useEffect(() => {
    if (index && initialQuery) {
      runSearch(initialQuery, filterState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

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
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
