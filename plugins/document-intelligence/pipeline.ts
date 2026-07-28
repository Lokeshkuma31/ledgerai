/**
 * Pipeline — the orchestrator tying every independent module together in
 * the spec's order: Document -> Classifier -> Parser Selection -> OCR/Text
 * Extraction -> Structured Fields -> Validation -> Duplicate Detection ->
 * Transaction Mapping -> Ingestion Pipeline -> Merchant Intelligence ->
 * Financial Platform. (Classification and Parser Selection both need OCR
 * text to run against, so — as in any real OCR pipeline — text extraction
 * executes first inside engine.ts's analyzeDocument(); everything from
 * Classification onward still happens in exactly the stated order.)
 *
 * Two phases, mirroring plugins/android-sms/plugin.ts's
 * buildPreviewRows/scanMessages vs. importSelected split:
 *   processDocument()  — analyze + validate + detect duplicates; no
 *                         storage/workflow side effects. Feeds the Upload
 *                         Preview.
 *   importDocument()   — Transaction Mapping -> Ingestion Pipeline
 *                         (Merchant Intelligence runs automatically inside
 *                         it) -> Workflow Engine. Never bypassed.
 * skipDocument()/rejectDocument()/editDocumentFields() cover the Preview's
 * other three user actions (Skip/Reject/Edit Fields).
 */
import { ingestTransaction } from "@/lib/ingestion/pipeline";
import { addTransactions } from "@/lib/storage";
import { runWorkflowsForTrigger } from "@/lib/workflows/engine";
import { analyzeDocument } from "@/plugins/document-intelligence/engine";
import type { OCRProvider } from "@/plugins/document-intelligence/ocr";
import { findDuplicate, getDocument, recordDocument, updateDocument } from "@/plugins/document-intelligence/registry";
import { validateFields } from "@/plugins/document-intelligence/validation";
import type {
  DocumentRecord,
  DocumentType,
  ExtractedFields,
  ExtractedTransactionLine,
  RawDocumentFile,
} from "@/plugins/document-intelligence/types";
import type { PaymentMethod, Transaction } from "@/types/transaction";

// --- Transaction Mapping -----------------------------------------------------

/** Core PaymentMethod has no "Bank Transfer"/"UPI-wallet"/etc. — each maps
 * to the closest existing option, the same best-effort approach
 * lib/banks/mapper.ts and the Android SMS plugin already take. Falls back
 * to a document-type-appropriate default when no payment method was
 * extracted at all. */
function mapPaymentMethod(raw: string | undefined, documentType: DocumentType): PaymentMethod {
  const lower = raw?.toLowerCase() ?? "";
  if (lower.includes("upi")) return "UPI";
  if (lower.includes("credit")) return "Credit Card";
  if (lower.includes("debit")) return "Debit Card";
  if (lower.includes("cash")) return "Cash";
  if (lower.includes("bank") || lower.includes("transfer")) return "Net Banking";
  return documentType === "credit-card-statement" ? "Credit Card" : "Net Banking";
}

/** Builds note text lib/merchant/engine.ts's extraction regexes recognize
 * ("at <Merchant>") — the same technique lib/banks/mapper.ts and the
 * Android SMS plugin use, so a document-sourced transaction is picked up
 * by Merchant Intelligence exactly like any other source's. */
function toIngestInput(line: ExtractedTransactionLine, fields: ExtractedFields, documentType: DocumentType) {
  const merchant = fields.merchant ?? line.description;
  const note = line.direction === "credit" ? `Payment received at ${merchant}` : `Payment at ${merchant}`;
  return {
    amount: line.amount,
    note,
    paymentMethod: mapPaymentMethod(fields.paymentMethod, documentType),
    date: line.date,
  };
}

/** A document a user manually completed via Edit Fields (adding a total
 * that the parser itself couldn't find) may still have an empty
 * `transactions` array — this synthesizes the one line item Import needs
 * from amount/total/balance directly, rather than requiring the user to
 * hand-construct a transaction line themselves. */
function syntheticLine(fields: ExtractedFields, documentType: DocumentType): ExtractedTransactionLine[] {
  const amount = fields.total ?? fields.amount ?? fields.balance;
  if (amount === undefined) return [];
  return [
    {
      description: fields.merchant ?? documentType.replace(/-/g, " "),
      amount,
      date: fields.issueDate ?? fields.dueDate ?? "",
      direction: "debit",
    },
  ];
}

// --- processDocument (analyze + validate + detect duplicates only) ---------

export interface ProcessOptions {
  ocrProvider?: OCRProvider;
}

export async function processDocument(file: RawDocumentFile, options: ProcessOptions = {}): Promise<DocumentRecord> {
  const analysis = await analyzeDocument(file, options.ocrProvider);
  const validationErrors = validateFields(analysis.classification.type, analysis.fields);
  const duplicate = findDuplicate(analysis.classification.type, analysis.fields);
  const now = new Date().toISOString();

  const record: DocumentRecord = {
    id: crypto.randomUUID(),
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    uploadedAt: file.uploadedAt,
    documentType: analysis.classification.type,
    classificationConfidence: analysis.classification.confidence,
    matchedRules: analysis.classification.matchedRules,
    parserUsed: analysis.parserUsed,
    extractionConfidence: analysis.fields.confidence,
    extractionDurationMs: analysis.extractionDurationMs,
    fields: analysis.fields,
    validationErrors,
    isDuplicate: duplicate !== undefined,
    duplicateOfId: duplicate?.id ?? null,
    status: validationErrors.some((e) => e.code === "malformed-document") ? "failed" : duplicate ? "duplicate" : "processed",
    linkedTransactionIds: [],
    processedAt: now,
    importedAt: null,
  };

  recordDocument(record);
  return record;
}

// --- importDocument (Transaction Mapping -> Ingestion -> Workflow Engine) --

export interface ImportOptions {
  /** Fields the user changed via Edit Fields before importing. */
  fieldsOverride?: Partial<ExtractedFields>;
  /** Required to import a document Duplicate Detection flagged — an
   * explicit override, never a default, so a repeated upload is never
   * silently re-imported. */
  force?: boolean;
}

const BLOCKING_ERROR_CODES = new Set(["missing-amount", "malformed-document"]);

export async function importDocument(documentId: string, options: ImportOptions = {}): Promise<DocumentRecord> {
  const record = getDocument(documentId);
  if (!record) throw new Error(`Document "${documentId}" was not found in the registry.`);
  if (record.status === "imported") return record;
  if (record.isDuplicate && !options.force) {
    throw new Error("This document was flagged as a duplicate — import with force to override.");
  }

  const fields: ExtractedFields = options.fieldsOverride ? { ...record.fields, ...options.fieldsOverride } : record.fields;
  const revalidation = validateFields(record.documentType, fields);
  const blocking = revalidation.filter((e) => BLOCKING_ERROR_CODES.has(e.code));
  if (blocking.length > 0) {
    throw new Error(`Cannot import: ${blocking.map((e) => e.message).join(" ")}`);
  }

  const lines = fields.transactions.length > 0 ? fields.transactions : syntheticLine(fields, record.documentType);

  const imported: Transaction[] = [];
  const mappingErrors: string[] = [];
  for (const line of lines) {
    try {
      imported.push(ingestTransaction(toIngestInput(line, fields, record.documentType)));
    } catch (error) {
      mappingErrors.push(error instanceof Error ? error.message : "Unknown transaction mapping error.");
    }
  }

  if (imported.length === 0) {
    throw new Error(mappingErrors[0] ?? "No valid transactions could be extracted from this document.");
  }

  addTransactions(imported);

  const now = new Date();
  for (const transaction of imported) {
    await runWorkflowsForTrigger("transaction-imported", { transaction, transactions: [transaction] }, now);
  }

  return updateDocument(documentId, {
    fields,
    validationErrors: revalidation,
    status: "imported",
    linkedTransactionIds: imported.map((t) => t.id),
    importedAt: now.toISOString(),
  })!;
}

export function skipDocument(id: string): DocumentRecord | undefined {
  return updateDocument(id, { status: "skipped" });
}

export function rejectDocument(id: string): DocumentRecord | undefined {
  return updateDocument(id, { status: "rejected" });
}

/** Applies a field patch (the Upload Preview's "Edit Fields" action),
 * then re-runs Validation and Duplicate Detection against the corrected
 * fields — fixing a missing invoice number, for instance, can turn a
 * "processed" document into a "duplicate" one, or vice versa. */
export function editDocumentFields(id: string, patch: Partial<ExtractedFields>): DocumentRecord | undefined {
  const record = getDocument(id);
  if (!record || record.status === "imported") return record;

  const fields: ExtractedFields = { ...record.fields, ...patch };
  const validationErrors = validateFields(record.documentType, fields);
  const duplicate = findDuplicate(record.documentType, fields);
  const isDuplicate = duplicate !== undefined && duplicate.id !== id;

  return updateDocument(id, {
    fields,
    validationErrors,
    isDuplicate,
    duplicateOfId: isDuplicate ? duplicate!.id : null,
    status: validationErrors.some((e) => e.code === "malformed-document") ? "failed" : isDuplicate ? "duplicate" : "processed",
  });
}
