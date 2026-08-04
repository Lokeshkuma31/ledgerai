/**
 * Document Repository — Postgres-backed persistence for
 * plugins/document-intelligence/registry.ts's successor. Returns
 * PersistedDocumentRecord (DocumentRecord + r2Key) rather than the shared
 * app-wide DocumentRecord type — r2Key only exists for documents that went
 * through a real upload (app/api/documents/upload/route.ts), and adding it
 * to the widely-imported DocumentRecord type would ripple into every
 * existing caller (components/DocumentUpload.tsx, lib/email/engine.ts,
 * mock-documents.ts fixtures, plugins/document-intelligence/pipeline.ts),
 * which this backend-only migration pass deliberately doesn't touch.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/src/generated/prisma/client";
import type { Document as PrismaDocument, DocumentStatus as PrismaDocumentStatus, DocumentType as PrismaDocumentType } from "@/src/generated/prisma/client";
import type {
  DocumentRecord,
  DocumentStatus,
  DocumentType,
  ExtractedFields,
  ValidationError,
} from "@/plugins/document-intelligence/types";

export type PersistedDocumentRecord = DocumentRecord & { r2Key: string | null };

const DOCUMENT_TYPE_TO_DB: Record<DocumentType, PrismaDocumentType> = {
  receipt: "RECEIPT",
  invoice: "INVOICE",
  "bank-statement": "BANK_STATEMENT",
  "credit-card-statement": "CREDIT_CARD_STATEMENT",
  "utility-bill": "UTILITY_BILL",
  "salary-slip": "SALARY_SLIP",
  "insurance-receipt": "INSURANCE_RECEIPT",
  "investment-statement": "INVESTMENT_STATEMENT",
  "loan-statement": "LOAN_STATEMENT",
  unknown: "UNKNOWN",
};
const DOCUMENT_TYPE_FROM_DB: Record<PrismaDocumentType, DocumentType> = {
  RECEIPT: "receipt",
  INVOICE: "invoice",
  BANK_STATEMENT: "bank-statement",
  CREDIT_CARD_STATEMENT: "credit-card-statement",
  UTILITY_BILL: "utility-bill",
  SALARY_SLIP: "salary-slip",
  INSURANCE_RECEIPT: "insurance-receipt",
  INVESTMENT_STATEMENT: "investment-statement",
  LOAN_STATEMENT: "loan-statement",
  UNKNOWN: "unknown",
};

const STATUS_TO_DB: Record<DocumentStatus, PrismaDocumentStatus> = {
  processed: "PROCESSED",
  duplicate: "DUPLICATE",
  imported: "IMPORTED",
  skipped: "SKIPPED",
  rejected: "REJECTED",
  failed: "FAILED",
};
const STATUS_FROM_DB: Record<PrismaDocumentStatus, DocumentStatus> = {
  PROCESSED: "processed",
  DUPLICATE: "duplicate",
  IMPORTED: "imported",
  SKIPPED: "skipped",
  REJECTED: "rejected",
  FAILED: "failed",
};

function toDocument(row: PrismaDocument): PersistedDocumentRecord {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedAt: row.uploadedAt.toISOString(),
    documentType: DOCUMENT_TYPE_FROM_DB[row.documentType],
    classificationConfidence: row.classificationConfidence,
    matchedRules: row.matchedRules,
    parserUsed: DOCUMENT_TYPE_FROM_DB[row.parserUsed],
    extractionConfidence: row.extractionConfidence,
    // Not stored (see the schema — Document has no extractionDurationMs
    // column); duration is operational telemetry, not identity, and isn't
    // read back by any current caller. Zero is an honest "unknown" here.
    extractionDurationMs: 0,
    fields: row.fields as unknown as ExtractedFields,
    validationErrors: row.validationErrors as unknown as ValidationError[],
    isDuplicate: row.isDuplicate,
    duplicateOfId: row.duplicateOfId,
    status: STATUS_FROM_DB[row.status],
    linkedTransactionIds: [], // derived from DocumentTransaction below
    processedAt: row.processedAt?.toISOString() ?? row.uploadedAt.toISOString(),
    importedAt: row.importedAt?.toISOString() ?? null,
    r2Key: row.r2Key,
  };
}

async function withLinkedTransactionIds(
  row: PrismaDocument,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<PersistedDocumentRecord> {
  const links = await client.documentTransaction.findMany({
    where: { documentId: row.id },
    select: { transactionId: true },
  });
  return { ...toDocument(row), linkedTransactionIds: links.map((l) => l.transactionId) };
}

export interface RecordDocumentInput extends Omit<DocumentRecord, "linkedTransactionIds"> {
  r2Key?: string | null;
}

/** Upserts by id, mirroring plugins/document-intelligence/registry.ts::
 * recordDocument's find-or-append semantics. linkedTransactionIds is
 * intentionally not accepted here — it's derived from the real
 * DocumentTransaction join table (see linkTransactions below), never
 * written directly. */
export async function recordDocument(
  organizationId: string,
  record: RecordDocumentInput,
): Promise<PersistedDocumentRecord> {
  const data = {
    organizationId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    r2Key: record.r2Key ?? null,
    uploadedAt: new Date(record.uploadedAt),
    documentType: DOCUMENT_TYPE_TO_DB[record.documentType],
    classificationConfidence: record.classificationConfidence,
    matchedRules: record.matchedRules,
    parserUsed: DOCUMENT_TYPE_TO_DB[record.parserUsed],
    extractionConfidence: record.extractionConfidence,
    fields: record.fields as unknown as Prisma.InputJsonValue,
    validationErrors: record.validationErrors as unknown as Prisma.InputJsonValue[],
    isDuplicate: record.isDuplicate,
    duplicateOfId: record.duplicateOfId,
    status: STATUS_TO_DB[record.status],
    processedAt: new Date(record.processedAt),
    importedAt: record.importedAt ? new Date(record.importedAt) : null,
  };
  const row = await prisma.document.upsert({
    where: { id: record.id },
    create: { id: record.id, ...data },
    update: data,
  });
  return withLinkedTransactionIds(row);
}

export async function updateDocument(
  organizationId: string,
  id: string,
  patch: Partial<Omit<RecordDocumentInput, "id">>,
): Promise<PersistedDocumentRecord | undefined> {
  const data: Record<string, unknown> = {};
  if (patch.fileName !== undefined) data.fileName = patch.fileName;
  if (patch.mimeType !== undefined) data.mimeType = patch.mimeType;
  if (patch.sizeBytes !== undefined) data.sizeBytes = patch.sizeBytes;
  if (patch.r2Key !== undefined) data.r2Key = patch.r2Key;
  if (patch.documentType !== undefined) data.documentType = DOCUMENT_TYPE_TO_DB[patch.documentType];
  if (patch.classificationConfidence !== undefined) data.classificationConfidence = patch.classificationConfidence;
  if (patch.matchedRules !== undefined) data.matchedRules = patch.matchedRules;
  if (patch.parserUsed !== undefined) data.parserUsed = DOCUMENT_TYPE_TO_DB[patch.parserUsed];
  if (patch.extractionConfidence !== undefined) data.extractionConfidence = patch.extractionConfidence;
  if (patch.fields !== undefined) data.fields = patch.fields as unknown as Prisma.InputJsonValue;
  if (patch.validationErrors !== undefined)
    data.validationErrors = patch.validationErrors as unknown as Prisma.InputJsonValue[];
  if (patch.isDuplicate !== undefined) data.isDuplicate = patch.isDuplicate;
  if (patch.duplicateOfId !== undefined) data.duplicateOfId = patch.duplicateOfId;
  if (patch.status !== undefined) data.status = STATUS_TO_DB[patch.status];
  if (patch.importedAt !== undefined) data.importedAt = patch.importedAt ? new Date(patch.importedAt) : null;

  const { count } = await prisma.document.updateMany({ where: { id, organizationId }, data });
  if (count === 0) return undefined;
  const row = await prisma.document.findUniqueOrThrow({ where: { id } });
  return withLinkedTransactionIds(row);
}

/** Records which transactions this document produced (Transaction Mapping
 * -> Ingestion) as real DocumentTransaction join rows, then marks the
 * document imported — the relational replacement for the old
 * linkedTransactionIds array. */
export async function linkTransactions(
  organizationId: string,
  documentId: string,
  transactionIds: string[],
  importedAt: Date,
): Promise<PersistedDocumentRecord> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.document.updateMany({
      where: { id: documentId, organizationId },
      data: { status: "IMPORTED", importedAt },
    });
    if (count === 0) throw new Error(`Document not found: ${documentId}`);

    if (transactionIds.length > 0) {
      await tx.documentTransaction.createMany({
        data: transactionIds.map((transactionId) => ({ documentId, transactionId })),
        skipDuplicates: true,
      });
    }
    const row = await tx.document.findUniqueOrThrow({ where: { id: documentId } });
    return withLinkedTransactionIds(row, tx);
  });
}

export async function getDocument(
  organizationId: string,
  id: string,
): Promise<PersistedDocumentRecord | undefined> {
  const row = await prisma.document.findFirst({ where: { id, organizationId } });
  return row ? withLinkedTransactionIds(row) : undefined;
}

export async function getAllDocuments(organizationId: string): Promise<PersistedDocumentRecord[]> {
  const rows = await prisma.document.findMany({ where: { organizationId } });
  return Promise.all(rows.map((row) => withLinkedTransactionIds(row)));
}

export async function getDocumentsByStatus(
  organizationId: string,
  status: DocumentStatus,
): Promise<PersistedDocumentRecord[]> {
  const rows = await prisma.document.findMany({ where: { organizationId, status: STATUS_TO_DB[status] } });
  return Promise.all(rows.map((row) => withLinkedTransactionIds(row)));
}

/** Every non-rejected/non-failed document for the organization — the
 * candidate pool services/documents/document-service.ts's duplicate-
 * detection logic scans, mirroring plugins/document-intelligence/
 * registry.ts::findDuplicate's own status filter. */
export async function getActiveDocuments(organizationId: string): Promise<PersistedDocumentRecord[]> {
  const rows = await prisma.document.findMany({
    where: { organizationId, status: { notIn: ["REJECTED", "FAILED"] } },
  });
  return Promise.all(rows.map((row) => withLinkedTransactionIds(row)));
}

export async function clearRegistry(organizationId: string): Promise<void> {
  await prisma.document.deleteMany({ where: { organizationId } });
}
