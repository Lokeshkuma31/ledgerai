const MEMORY_STORAGE_KEY = "ledgerai:memory";

export interface MemoryEntry {
  key: string;
  note: string;
  category: string;
}

type MemoryStore = Record<string, { note: string; category: string }>;

function normalizeNoteKey(note: string): string {
  return note.trim().replace(/\s+/g, " ").toLowerCase();
}

function readMemory(): MemoryStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MEMORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as MemoryStore;
  } catch {
    return {};
  }
}

function writeMemory(store: MemoryStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(store));
}

export function learnCategory(note: string, category: string): void {
  const key = normalizeNoteKey(note);
  if (!key) return;
  const store = readMemory();
  store[key] = { note: note.trim().replace(/\s+/g, " "), category };
  writeMemory(store);
}

export function findRememberedCategory(note: string): string | null {
  const key = normalizeNoteKey(note);
  if (!key) return null;
  return readMemory()[key]?.category ?? null;
}

export function getMemoryEntries(): MemoryEntry[] {
  const store = readMemory();
  return Object.entries(store)
    .map(([key, value]) => ({ key, note: value.note, category: value.category }))
    .sort((a, b) => a.note.localeCompare(b.note));
}

export function forgetCategory(key: string): void {
  const store = readMemory();
  delete store[key];
  writeMemory(store);
}

export function clearMemory(): void {
  writeMemory({});
}
