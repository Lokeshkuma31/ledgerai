/**
 * Document Intelligence plugin — shared types. Every other module in this
 * plugin depends only on this file (plus, where noted, each other's public
 * functions) — it never depends on them, so this stays the single source
 * of truth for the plugin's data shapes.
 */

export const DOCUMENT_TYPES = [
  "receipt",
  "invoice",
  "bank-statement",
  "credit-card-statement",
  "utility-bill",
  "salary-slip",
  "insurance-receipt",
  "investment-statement",
  "loan-statement",
  "unknown",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** A document's position in the review/import lifecycle. "processed" means
 * classification + extraction + validation ran and it's awaiting a user
 * decision (Import/Skip/Edit/Reject) in the Upload Preview; "duplicate"
 * means the same decision is pending but Duplicate Detection already
 * flagged it. */
export const DOCUMENT_STATUSES = ["processed", "duplicate", "imported", "skipped", "rejected", "failed"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** What engine.ts's classifier.ts returns — deterministic, rule-based, no
 * LLM. `matchedRules` names every keyword rule that contributed to the
 * winning type's score, for transparency in the Upload Preview. */
export interface ClassificationResult {
  type: DocumentType;
  confidence: number; // 0-1
  matchedRules: string[];
}

/** What an OCRProvider hands back — see ocr.ts. Deliberately minimal: a
 * real provider's richer output (bounding boxes, per-line confidence,
 * language) can be added to this shape later without changing anything
 * that only reads `text`/`confidence`/`pageCount`. */
export interface OCRResult {
  text: string;
  confidence: number; // 0-1, the provider's own OCR confidence
  pageCount: number;
}

/** The file metadata this plugin operates on. There is no real file
 * upload/storage in this milestone — `mockTextKey` selects which
 * mock-documents.ts fixture ocr.ts's MockOCRProvider returns for it. */
export interface RawDocumentFile {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string; // ISO 8601
  mockTextKey: string;
}

export interface StatementPeriod {
  start: string; // "YYYY-MM-DD"
  end: string; // "YYYY-MM-DD"
}

export interface ExtractedTransactionLine {
  description: string;
  amount: number;
  date: string; // "YYYY-MM-DD"
  direction: "debit" | "credit";
}

/** Every field parsers.ts's per-type parsers may populate. Every field is
 * optional except rawText/confidence — a document's own type determines
 * which fields are realistically present (a Receipt has no
 * statementPeriod; a Bank Statement has no single `merchant`). */
export interface ExtractedFields {
  merchant?: string;
  amount?: number;
  currency?: string;
  tax?: number;
  discount?: number;
  total?: number;
  invoiceNumber?: string;
  receiptNumber?: string;
  accountNumber?: string; // already masked, e.g. "XXXX4321"
  statementPeriod?: StatementPeriod;
  transactions: ExtractedTransactionLine[];
  paymentMethod?: string;
  referenceNumber?: string;
  dueDate?: string; // "YYYY-MM-DD"
  issueDate?: string; // "YYYY-MM-DD"
  balance?: number;
  rawText: string;
  confidence: number; // 0-1, extraction (not classification) confidence
}

export const VALIDATION_ERROR_CODES = [
  "missing-amount",
  "missing-date",
  "invalid-date",
  "invalid-currency",
  "missing-required-field",
  "malformed-document",
  "duplicate-number",
] as const;
export type ValidationErrorCode = (typeof VALIDATION_ERROR_CODES)[number];

export interface ValidationError {
  code: ValidationErrorCode;
  field?: string;
  message: string;
}

/** What engine.ts's analyzeDocument() returns — classification + OCR +
 * extraction, with no validation/duplicate/mapping/ingestion side effects.
 * pipeline.ts is the only caller. */
export interface AnalysisResult {
  ocr: OCRResult;
  classification: ClassificationResult;
  fields: ExtractedFields;
  parserUsed: DocumentType;
  extractionDurationMs: number;
}

/** The Document Registry's persisted record — combines the original file
 * metadata, extraction outcome, and import lineage, mirroring
 * lib/banks/types.ts's ConnectorRecord/SyncRun split for a single object. */
export interface DocumentRecord {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string; // ISO 8601
  documentType: DocumentType;
  classificationConfidence: number;
  matchedRules: string[];
  parserUsed: DocumentType;
  extractionConfidence: number;
  extractionDurationMs: number;
  fields: ExtractedFields;
  validationErrors: ValidationError[];
  isDuplicate: boolean;
  duplicateOfId: string | null;
  status: DocumentStatus;
  linkedTransactionIds: string[];
  processedAt: string; // ISO 8601 — when analysis/validation/dedupe finished
  importedAt: string | null; // ISO 8601
}

export interface DocumentStatistics {
  documentsImported: number;
  ocrSuccessRate: number; // 0-1 — OCR results with non-empty text / total processed
  parserAccuracy: number; // 0-1 — classified as a known type (not "unknown") / total processed
  averageExtractionTimeMs: number;
  duplicatesPrevented: number;
  transactionsExtracted: number;
  unknownDocumentsCount: number;
}
