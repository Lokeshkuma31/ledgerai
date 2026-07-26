import type { IngestInput } from "@/lib/ingestion/pipeline";

/** A CSV row after header parsing, keyed by the file's own column headers
 * (trimmed, original casing) — unknown columns simply pass through unused. */
export type RawCSVRow = Record<string, string>;

export interface CSVParseResult {
  headers: string[];
  rows: RawCSVRow[];
}

export type ImportRowStatus = "Ready" | "Duplicate" | "Invalid";

export interface ImportRowError {
  rowNumber: number; // 1-based, matching the file (header row = 1)
  message: string;
}

export interface ImportPreviewRow {
  rowNumber: number;
  date: string;
  description: string;
  merchantName?: string;
  amount: number | null;
  status: ImportRowStatus;
  errors: string[];
  /** Present whenever status !== "Invalid" — what would actually be sent
   * through the Ingestion Pipeline if this row is imported. */
  mappedInput?: IngestInput;
}

export interface ImportPreview {
  fileName: string;
  totalRows: number;
  readyCount: number;
  duplicateCount: number;
  invalidCount: number;
  rows: ImportPreviewRow[];
}

export interface ImportReport {
  fileName: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  importedCount: number;
  skippedCount: number;
  duplicateCount: number;
  invalidCount: number;
  detectedMerchantCount: number;
  newMerchantCount: number;
  aiCategoriesAssignedCount: number;
  memoryMatchCount: number;
  warnings: ImportRowError[];
}

export interface ImportHistoryEntry {
  id: string;
  fileName: string;
  importedAt: string; // report.finishedAt
  importedCount: number;
  skippedCount: number;
  durationMs: number;
  warnings: ImportRowError[];
}
