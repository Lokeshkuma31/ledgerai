import type { ImportHistoryEntry, ImportReport } from "@/types/import";

const HISTORY_KEY = "ledgerai:import-history";
const MAX_ENTRIES = 50;

function readHistory(): ImportHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ImportHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: ImportHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

/** Newest first. */
export function getImportHistory(): ImportHistoryEntry[] {
  return readHistory();
}

export function recordImport(report: ImportReport): ImportHistoryEntry[] {
  const entry: ImportHistoryEntry = {
    id: crypto.randomUUID(),
    fileName: report.fileName,
    importedAt: report.finishedAt,
    importedCount: report.importedCount,
    skippedCount: report.skippedCount,
    durationMs: report.durationMs,
    warnings: report.warnings,
  };
  const updated = [entry, ...readHistory()].slice(0, MAX_ENTRIES);
  writeHistory(updated);
  return updated;
}
