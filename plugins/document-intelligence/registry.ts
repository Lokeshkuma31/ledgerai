/**
 * Document Registry — persisted metadata for every document that has ever
 * been through the pipeline: original file metadata, extraction outcome,
 * status, parser used, and linked transaction ids. Independent of
 * engine.ts/pipeline.ts's own logic; it only knows the DocumentRecord
 * shape (types.ts). Also the data source the Financial Semantic Index
 * queries against (see plugin.ts's index contributor).
 */
import type { DocumentRecord, DocumentStatistics, DocumentStatus, DocumentType, ExtractedFields } from "@/plugins/document-intelligence/types";

const DOCUMENTS_KEY = "ledgerai:plugins:document-intelligence:documents";

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readAll(): DocumentRecord[] {
  return readJSON<DocumentRecord[]>(DOCUMENTS_KEY, []);
}

function writeAll(records: DocumentRecord[]): void {
  writeJSON(DOCUMENTS_KEY, records);
}

export function recordDocument(record: DocumentRecord): void {
  const all = readAll();
  const index = all.findIndex((r) => r.id === record.id);
  if (index === -1) {
    writeAll([...all, record]);
  } else {
    all[index] = record;
    writeAll(all);
  }
}

export function updateDocument(id: string, patch: Partial<DocumentRecord>): DocumentRecord | undefined {
  const all = readAll();
  const index = all.findIndex((r) => r.id === id);
  if (index === -1) return undefined;
  all[index] = { ...all[index], ...patch };
  writeAll(all);
  return all[index];
}

export function getDocument(id: string): DocumentRecord | undefined {
  return readAll().find((r) => r.id === id);
}

export function getAllDocuments(): DocumentRecord[] {
  return readAll();
}

export function getDocumentsByStatus(status: DocumentStatus): DocumentRecord[] {
  return readAll().filter((r) => r.status === status);
}

export function clearRegistry(): void {
  writeAll([]);
}

/** The identity a document is deduplicated on: its own invoice/receipt/
 * reference number when one was extracted (the strongest signal — mirrors
 * lib/banks/mapper.ts's externalId-based dedup), otherwise a fallback
 * fingerprint over merchant + amount + date. Always prefixed with the
 * document type so a Receipt and an Invoice that happen to share a number
 * never collide. */
function documentKey(documentType: DocumentType, fields: ExtractedFields): string {
  const idNumber = fields.invoiceNumber ?? fields.receiptNumber ?? fields.referenceNumber;
  if (idNumber) return `${documentType}:num:${idNumber.toLowerCase()}`;

  const amount = fields.total ?? fields.amount ?? fields.balance ?? 0;
  const date = fields.issueDate ?? fields.dueDate ?? "";
  const merchant = (fields.merchant ?? "").toLowerCase();
  return `${documentType}:fp:${merchant}|${amount.toFixed(2)}|${date}`;
}

/**
 * Finds an existing, non-rejected/non-failed document with the same
 * identity as `fields` — pipeline.ts calls this during Duplicate
 * Detection, after Structured Field Extraction and before Transaction
 * Mapping, exactly where the spec's pipeline order places it.
 */
export function findDuplicate(documentType: DocumentType, fields: ExtractedFields): DocumentRecord | undefined {
  const key = documentKey(documentType, fields);
  return readAll().find(
    (r) => r.status !== "rejected" && r.status !== "failed" && documentKey(r.documentType, r.fields) === key,
  );
}

export function computeStatistics(): DocumentStatistics {
  const all = readAll();
  const total = all.length;

  const documentsImported = all.filter((d) => d.status === "imported").length;
  const ocrSuccessRate = total === 0 ? 0 : all.filter((d) => d.fields.rawText.trim().length > 0).length / total;
  const parserAccuracy = total === 0 ? 0 : all.filter((d) => d.documentType !== "unknown").length / total;

  const durations = all.map((d) => d.extractionDurationMs).filter((n) => Number.isFinite(n));
  const averageExtractionTimeMs = durations.length === 0 ? 0 : Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);

  const duplicatesPrevented = all.filter((d) => d.isDuplicate && d.status !== "imported").length;
  const transactionsExtracted = all.reduce((sum, d) => sum + d.linkedTransactionIds.length, 0);
  const unknownDocumentsCount = all.filter((d) => d.documentType === "unknown").length;

  return { documentsImported, ocrSuccessRate, parserAccuracy, averageExtractionTimeMs, duplicatesPrevented, transactionsExtracted, unknownDocumentsCount };
}
