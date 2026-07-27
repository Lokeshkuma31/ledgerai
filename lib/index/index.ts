import { buildFinancialIndex as constructIndex } from "@/lib/index/builder";
import { computeIndexSignature, getCachedIndex, setCachedIndex } from "@/lib/index/registry";
import { searchFinancialIndex as runSearch } from "@/lib/index/search";
import type { FinancialIndex, FinancialIndexSources, IndexedObject, SearchOptions, SearchResult } from "@/types/index";

const indexContributors = new Set<() => IndexedObject[]>();

/**
 * Published extension point for plugins with the "search-provider"
 * capability — how they register indexable resources without this engine
 * (or the Query Engine that consults it) knowing anything about them.
 * Called from a plugin's own register()/unregister(). Returns an
 * unregister function.
 */
export function registerIndexContributor(contributor: () => IndexedObject[]): () => void {
  indexContributors.add(contributor);
  return () => {
    indexContributors.delete(contributor);
  };
}

/** A misbehaving plugin must never break indexing for everyone else —
 * each contributor runs in its own try/catch. */
function collectContributedObjects(): IndexedObject[] {
  const objects: IndexedObject[] = [];
  for (const contributor of indexContributors) {
    try {
      objects.push(...contributor());
    } catch (error) {
      console.error("A search-provider plugin threw while contributing index objects:", error);
    }
  }
  return objects;
}

/**
 * Financial Semantic Index — public entry point. Building is signature-cached
 * (lib/index/registry.ts) so unrelated re-renders don't re-scan every
 * transaction/merchant/budget/etc. on every call; a rebuild only happens
 * when something the signature tracks has actually changed. Plugin-
 * contributed objects (see registerIndexContributor above) are always
 * recomputed fresh and appended on top, bypassing the cache — they aren't
 * covered by the core signature and are assumed cheap to produce.
 */
export function buildFinancialIndex(sources: FinancialIndexSources): FinancialIndex {
  const signature = computeIndexSignature(sources);
  const cached = getCachedIndex(signature);
  const core = cached ?? constructIndex(sources);
  if (!cached) setCachedIndex(signature, core);

  const contributed = collectContributedObjects();
  if (contributed.length === 0) return core;

  const objects = [...core.objects, ...contributed];
  const counts = { ...core.counts };
  for (const obj of contributed) {
    counts[obj.type] = (counts[obj.type] ?? 0) + 1;
  }
  return { ...core, objects, counts };
}

export function searchFinancialIndex(index: FinancialIndex, options: SearchOptions, now?: Date): SearchResult {
  return runSearch(index, options, now);
}
