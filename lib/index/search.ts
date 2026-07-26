import { applyFilters } from "@/lib/index/filters";
import { computeRelevanceScore } from "@/lib/index/ranking";
import type {
  FinancialIndex,
  IndexedObject,
  SearchMatchType,
  SearchOptions,
  SearchResult,
  SearchResultItem,
} from "@/types/index";

const DEFAULT_LIMIT = 50;

/** No query text means every filtered object is a match — filters alone
 * did the narrowing. Otherwise: an exact hit on title/merchant/category
 * outranks a plain substring hit anywhere in the searchable text. */
function classifyMatch(object: IndexedObject, query: string): SearchMatchType | null {
  if (!query) return "filter-only";
  const lower = query.toLowerCase();
  if (
    object.title.toLowerCase() === lower ||
    object.merchant?.toLowerCase() === lower ||
    object.category?.toLowerCase() === lower
  ) {
    return "exact";
  }
  if (object.searchableText.includes(lower)) return "partial";
  return null;
}

function sortItems(items: SearchResultItem[], sortBy: NonNullable<SearchOptions["sortBy"]>): SearchResultItem[] {
  const sorted = [...items];
  switch (sortBy) {
    case "date":
      return sorted.sort((a, b) =>
        (b.object.date ?? b.object.updatedAt).localeCompare(a.object.date ?? a.object.updatedAt),
      );
    case "amount":
      return sorted.sort((a, b) => (b.object.amount ?? 0) - (a.object.amount ?? 0));
    case "relevance":
      return sorted.sort((a, b) => b.score - a.score);
  }
}

/**
 * Keyword/exact/partial search over an already-built FinancialIndex.
 * Filtering (filters.ts) narrows the candidate set first; ranking.ts
 * scores what's left; this module only classifies matches and orders
 * the result. `now` defaults to the current time but is accepted as a
 * parameter so recency scoring stays deterministic in tests.
 */
export function searchFinancialIndex(
  index: FinancialIndex,
  options: SearchOptions,
  now: Date = new Date(),
): SearchResult {
  const query = options.query.trim();
  const filtered = applyFilters(index.objects, options.filters);

  const items: SearchResultItem[] = [];
  for (const object of filtered) {
    const matchType = classifyMatch(object, query);
    if (matchType === null) continue;
    if (options.filters?.exact && matchType !== "exact") continue;
    items.push({ object, score: computeRelevanceScore(object, matchType, now), matchType });
  }

  const sorted = sortItems(items, options.sortBy ?? "relevance");
  const limit = options.limit ?? DEFAULT_LIMIT;

  return {
    query,
    items: sorted.slice(0, limit),
    totalMatches: items.length,
    generatedAt: now.toISOString(),
  };
}
