const STORAGE_KEY = "ledgerai:pinned-insights";

function readIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

/**
 * A small, standalone registry of pinned recommendation ids — mirrors the
 * `pinned` flag lib/index/registry.ts already keeps on recent searches,
 * kept separate from lib/decision/storage.ts's dismiss/complete status map
 * so pinning (an AI Coach workspace concept) doesn't grow the Decision
 * Engine's own persisted-status shape.
 */
export function getPinnedInsightIds(): string[] {
  return [...readIds()];
}

export function togglePinnedInsight(id: string): string[] {
  const ids = readIds();
  if (ids.has(id)) {
    ids.delete(id);
  } else {
    ids.add(id);
  }
  writeIds(ids);
  return [...ids];
}
