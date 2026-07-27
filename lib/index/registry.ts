import type { FinancialIndex, FinancialIndexSources, RecentSearch, SearchFilters } from "@/types/index";

const RECENT_SEARCHES_KEY = "ledgerai:recent-searches";
const SEARCH_TERM_COUNTS_KEY = "ledgerai:search-term-counts";
const TOTAL_SEARCH_COUNT_KEY = "ledgerai:search-total-count";
const MAX_RECENT_SEARCHES = 20;

function readRecentSearches(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentSearch[]) : [];
  } catch {
    return [];
  }
}

function writeRecentSearches(list: RecentSearch[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
}

function readTermCounts(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SEARCH_TERM_COUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeTermCounts(counts: Record<string, number>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEARCH_TERM_COUNTS_KEY, JSON.stringify(counts));
}

function readTotalSearchCount(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(TOTAL_SEARCH_COUNT_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeTotalSearchCount(count: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOTAL_SEARCH_COUNT_KEY, String(count));
}

export function getRecentSearches(): RecentSearch[] {
  return readRecentSearches();
}

/** Records a search in the recent list (pinned entries are always kept,
 * unpinned ones are capped and oldest-first evicted) and bumps that term's
 * lifetime count for search statistics — tracked separately from the
 * capped recent list so "most searched" stays accurate even after older
 * searches roll off. */
export function addRecentSearch(
  query: string,
  filters: SearchFilters | undefined,
  resultCount: number,
): RecentSearch[] {
  const trimmedQuery = query.trim();
  const list = readRecentSearches();
  const entry: RecentSearch = {
    id: typeof window === "undefined" ? "" : crypto.randomUUID(),
    query: trimmedQuery,
    filters,
    resultCount,
    pinned: false,
    createdAt: new Date().toISOString(),
  };

  const updated = [entry, ...list];
  const pinned = updated.filter((s) => s.pinned);
  const unpinned = updated.filter((s) => !s.pinned);
  const capped = [...pinned, ...unpinned.slice(0, Math.max(0, MAX_RECENT_SEARCHES - pinned.length))];
  writeRecentSearches(capped);

  writeTotalSearchCount(readTotalSearchCount() + 1);
  if (trimmedQuery) {
    const counts = readTermCounts();
    const key = trimmedQuery.toLowerCase();
    counts[key] = (counts[key] ?? 0) + 1;
    writeTermCounts(counts);
  }

  return capped;
}

export function deleteRecentSearch(id: string): RecentSearch[] {
  const updated = readRecentSearches().filter((s) => s.id !== id);
  writeRecentSearches(updated);
  return updated;
}

export function clearRecentSearches(): RecentSearch[] {
  writeRecentSearches([]);
  return [];
}

export function togglePinSearch(id: string): RecentSearch[] {
  const updated = readRecentSearches().map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s));
  writeRecentSearches(updated);
  return updated;
}

export function getMostSearchedTerms(limit = 5): { term: string; count: number }[] {
  return Object.entries(readTermCounts())
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Every recorded search, including filter-only ones with no query text —
 * distinct from term counts, which only track non-empty queries (used for
 * "most searched terms"). */
export function getTotalSearchCount(): number {
  return readTotalSearchCount();
}

// --- In-memory index cache -------------------------------------------------
// The FinancialIndex itself is fully derived from other engines' output, so
// it doesn't need to survive a page reload — only avoiding a rebuild on
// every keystroke/re-render within a single session matters. A signature
// string (not the full index) is compared to decide whether a rebuild is
// actually needed.

let cachedIndex: FinancialIndex | null = null;
let cachedSignature: string | null = null;

export function getCachedIndex(signature: string): FinancialIndex | null {
  return cachedSignature === signature ? cachedIndex : null;
}

export function setCachedIndex(signature: string, index: FinancialIndex): void {
  cachedSignature = signature;
  cachedIndex = index;
}

/**
 * Captures every field that would change the built index: transaction
 * review state, merchant profile updates, budget usage, recurring status,
 * the event/recommendation sets, forecast regeneration, and conversation
 * history growth. Any change to these — and only these — should trigger a
 * rebuild.
 */
export function computeIndexSignature(sources: FinancialIndexSources): string {
  const parts = [
    sources.transactions.map((t) => `${t.id}:${t.reviewed ? 1 : 0}`).join(","),
    sources.merchantProfiles.map((m) => `${m.id}:${m.updatedAt}`).join(","),
    sources.budgets.map((b) => `${b.id}:${b.percentageUsed.toFixed(2)}`).join(","),
    sources.recurring.map((r) => `${r.id}:${r.status}`).join(","),
    sources.events.map((e) => e.id).join(","),
    sources.recommendations.map((r) => `${r.id}:${r.status}`).join(","),
    sources.forecast.forecastGeneratedAt,
    sources.conversationHistory.map((c) => c.id).join(","),
    sources.explanations.map((e) => `${e.id}:${e.lastUpdated}`).join(","),
    (sources.workflowRuns ?? []).map((r) => `${r.runId}:${r.status}`).join(","),
  ];
  return parts.join("|");
}
