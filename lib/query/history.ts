import type { QueryResult } from "@/types/query";

const HISTORY_KEY = "ledgerai:query-history";
const MAX_ENTRIES = 50;

function readHistory(): QueryResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueryResult[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: QueryResult[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

/** Newest first. */
export function getHistory(): QueryResult[] {
  return readHistory();
}

export function addToHistory(result: QueryResult): QueryResult[] {
  const updated = [result, ...readHistory()].slice(0, MAX_ENTRIES);
  writeHistory(updated);
  return updated;
}

export function deleteFromHistory(id: string): QueryResult[] {
  const updated = readHistory().filter((r) => r.id !== id);
  writeHistory(updated);
  return updated;
}

export function clearHistory(): QueryResult[] {
  writeHistory([]);
  return [];
}
