/**
 * Document Service — the async, Postgres-backed successor to
 * plugins/document-intelligence/registry.ts, plus the R2 wiring the
 * migration plan pairs with it: storage becomes real (presigned upload/
 * download URLs against a real r2Key), OCR stays mocked
 * (plugins/document-intelligence/ocr.ts's MockOCRProvider, still keyed by
 * mockTextKey, is untouched) — deliberately decoupled, per the plan.
 */
import { buildDocumentKey, createDownloadUrl, createUploadUrl } from "@/lib/storage/signed-url";
import * as documentRepository from "@/repositories/document-repository";
import type { PersistedDocumentRecord, RecordDocumentInput } from "@/repositories/document-repository";
import type { DocumentStatus, DocumentType, ExtractedFields } from "@/plugins/document-intelligence/types";

export async function recordDocument(
  organizationId: string,
  record: RecordDocumentInput,
): Promise<PersistedDocumentRecord> {
  return documentRepository.recordDocument(organizationId, record);
}

export async function updateDocument(
  organizationId: string,
  id: string,
  patch: Partial<Omit<RecordDocumentInput, "id">>,
): Promise<PersistedDocumentRecord | undefined> {
  return documentRepository.updateDocument(organizationId, id, patch);
}

export async function linkTransactions(
  organizationId: string,
  documentId: string,
  transactionIds: string[],
  importedAt: Date = new Date(),
): Promise<PersistedDocumentRecord> {
  return documentRepository.linkTransactions(organizationId, documentId, transactionIds, importedAt);
}

export async function getDocument(
  organizationId: string,
  id: string,
): Promise<PersistedDocumentRecord | undefined> {
  return documentRepository.getDocument(organizationId, id);
}

export async function getAllDocuments(organizationId: string): Promise<PersistedDocumentRecord[]> {
  return documentRepository.getAllDocuments(organizationId);
}

export async function getDocumentsByStatus(
  organizationId: string,
  status: DocumentStatus,
): Promise<PersistedDocumentRecord[]> {
  return documentRepository.getDocumentsByStatus(organizationId, status);
}

export async function clearRegistry(organizationId: string): Promise<void> {
  return documentRepository.clearRegistry(organizationId);
}

/** The identity a document is deduplicated on, mirroring
 * plugins/document-intelligence/registry.ts::documentKey exactly: its own
 * invoice/receipt/reference number when extracted, otherwise a fallback
 * fingerprint over merchant + amount + date. */
function documentKey(documentType: DocumentType, fields: ExtractedFields): string {
  const idNumber = fields.invoiceNumber ?? fields.receiptNumber ?? fields.referenceNumber;
  if (idNumber) return `${documentType}:num:${idNumber.toLowerCase()}`;

  const amount = fields.total ?? fields.amount ?? fields.balance ?? 0;
  const date = fields.issueDate ?? fields.dueDate ?? "";
  const merchant = (fields.merchant ?? "").toLowerCase();
  return `${documentType}:fp:${merchant}|${amount.toFixed(2)}|${date}`;
}

/** Finds an existing, non-rejected/non-failed document with the same
 * identity as `fields`, mirroring plugins/document-intelligence/
 * registry.ts::findDuplicate exactly. */
export async function findDuplicate(
  organizationId: string,
  documentType: DocumentType,
  fields: ExtractedFields,
): Promise<PersistedDocumentRecord | undefined> {
  const key = documentKey(documentType, fields);
  const active = await documentRepository.getActiveDocuments(organizationId);
  return active.find((r) => documentKey(r.documentType, r.fields) === key);
}

/** Mirrors plugins/document-intelligence/registry.ts::computeStatistics,
 * except averageExtractionTimeMs — extraction duration isn't persisted
 * (see repositories/document-repository.ts's mapper comment; it's
 * operational telemetry, not part of the Document model), so it's always 0
 * here rather than silently wrong. */
export async function computeStatistics(organizationId: string) {
  const all = await documentRepository.getAllDocuments(organizationId);
  const total = all.length;

  const documentsImported = all.filter((d) => d.status === "imported").length;
  const ocrSuccessRate = total === 0 ? 0 : all.filter((d) => d.fields.rawText.trim().length > 0).length / total;
  const parserAccuracy = total === 0 ? 0 : all.filter((d) => d.documentType !== "unknown").length / total;
  const duplicatesPrevented = all.filter((d) => d.isDuplicate && d.status !== "imported").length;
  const transactionsExtracted = all.reduce((sum, d) => sum + d.linkedTransactionIds.length, 0);
  const unknownDocumentsCount = all.filter((d) => d.documentType === "unknown").length;

  return {
    documentsImported,
    ocrSuccessRate,
    parserAccuracy,
    averageExtractionTimeMs: 0,
    duplicatesPrevented,
    transactionsExtracted,
    unknownDocumentsCount,
  };
}

// --- R2 wiring -----------------------------------------------------------------

/** Issues a presigned PUT URL for a not-yet-uploaded document — the client
 * PUTs bytes directly to R2, the file never streams through this server.
 * Returns the r2Key too, so the caller can pass it straight into
 * recordDocument() once the upload (and analysis) completes. */
export async function getDocumentUploadUrl(
  organizationId: string,
  documentId: string,
  fileName: string,
  contentType: string,
): Promise<{ uploadUrl: string; r2Key: string }> {
  const r2Key = buildDocumentKey(organizationId, documentId, fileName);
  const uploadUrl = await createUploadUrl(r2Key, contentType);
  return { uploadUrl, r2Key };
}

/** A presigned GET URL for viewing/re-processing a document's original
 * bytes — null when the document has no R2 object (email-attachment- or
 * mock-fixture-sourced documents never had a real upload). */
export async function getDocumentDownloadUrl(
  organizationId: string,
  documentId: string,
): Promise<string | null> {
  const document = await documentRepository.getDocument(organizationId, documentId);
  if (!document?.r2Key) return null;
  return createDownloadUrl(document.r2Key);
}
