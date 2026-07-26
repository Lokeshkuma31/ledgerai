import { buildFinancialIndex as constructIndex } from "@/lib/index/builder";
import { computeIndexSignature, getCachedIndex, setCachedIndex } from "@/lib/index/registry";
import { searchFinancialIndex as runSearch } from "@/lib/index/search";
import type { FinancialIndex, FinancialIndexSources, SearchOptions, SearchResult } from "@/types/index";

/**
 * Financial Semantic Index — public entry point. Building is signature-cached
 * (lib/index/registry.ts) so unrelated re-renders don't re-scan every
 * transaction/merchant/budget/etc. on every call; a rebuild only happens
 * when something the signature tracks has actually changed.
 */
export function buildFinancialIndex(sources: FinancialIndexSources): FinancialIndex {
  const signature = computeIndexSignature(sources);
  const cached = getCachedIndex(signature);
  if (cached) return cached;

  const index = constructIndex(sources);
  setCachedIndex(signature, index);
  return index;
}

export function searchFinancialIndex(index: FinancialIndex, options: SearchOptions, now?: Date): SearchResult {
  return runSearch(index, options, now);
}
