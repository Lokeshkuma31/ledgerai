/**
 * Email Intelligence Framework — shared types. Every other module in
 * lib/email/ depends only on this file (plus, where noted, each other's
 * own public functions) — it never depends on them, the same single-
 * source-of-truth role lib/banks/types.ts plays for the Bank Connector
 * Framework.
 */

export const EMAIL_TYPES = [
  "receipt",
  "invoice",
  "subscription-renewal",
  "refund",
  "salary-slip",
  "utility-bill",
  "credit-card-statement",
  "bank-statement",
  "flight-booking",
  "hotel-booking",
  "insurance",
  "loan",
  "investment-report",
  "tax-document",
  "unknown",
] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];

export const EMAIL_SYNC_TYPES = ["full", "incremental", "manual", "scheduled"] as const;
export type EmailSyncType = (typeof EMAIL_SYNC_TYPES)[number];

export const EMAIL_RECORD_STATUSES = ["processed", "duplicate", "imported", "skipped", "rejected", "failed"] as const;
export type EmailRecordStatus = (typeof EMAIL_RECORD_STATUSES)[number];

export const ATTACHMENT_KINDS = ["pdf", "image", "csv", "text"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/**
 * An email's attachment as a provider reports it. `mockTextKey`, when
 * present, is a key into plugins/document-intelligence/mock-documents.ts's
 * MOCK_OCR_TEXT fixtures — the same mock-OCR-fixture mechanism that
 * plugin's own ocr.ts uses, so an email attachment can be handed straight
 * to Document Intelligence's pipeline without this framework ever parsing
 * a document itself. Absent for attachments not meant to be parsed (e.g. a
 * decorative inline image).
 */
export interface RawEmailAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  mockTextKey?: string;
}

/**
 * A provider-agnostic email as handed from an EmailProvider to the
 * pipeline — `body` is already-resolved plain text, exactly what a real
 * Gmail API/IMAP fetch would return directly (no separate "OCR-style"
 * extraction step is needed for an email body the way one is for a
 * document's binary bytes). plugins/gmail/mock-provider.ts resolves its
 * fixture text into this field itself; no provider in this milestone does
 * real network fetching.
 */
export interface RawEmail {
  externalId: string;
  providerId: string;
  subject: string;
  sender: string;
  receivedAt: string; // ISO 8601
  body: string;
  attachments: RawEmailAttachment[];
}

export interface EmailClassification {
  type: EmailType;
  confidence: number; // 0-1
  matchedRules: string[];
}

export interface StatementPeriod {
  start: string; // "YYYY-MM-DD"
  end: string; // "YYYY-MM-DD"
}

export interface ExtractedEmailTransactionLine {
  description: string;
  amount: number;
  date: string; // "YYYY-MM-DD"
  direction: "debit" | "credit";
}

export interface EmailAttachmentMeta {
  id: string;
  fileName: string;
  mimeType: string;
  kind: AttachmentKind;
  /** Set once engine.ts has run this attachment through the Document
   * Intelligence Plugin — the DocumentRecord id it produced. */
  documentId: string | null;
}

/** Every field the Body Parser / Structured Extraction stage populates.
 * Deliberately matches only what the spec asks emails to carry — no
 * per-document fields (tax/discount/receiptNumber/...) belong here; those
 * live on the attachment's own DocumentRecord, reached via
 * EmailAttachmentMeta.documentId. */
export interface ExtractedEmailFields {
  subject: string;
  sender: string;
  merchant?: string;
  amount?: number;
  currency?: string;
  invoiceNumber?: string;
  referenceNumber?: string;
  dueDate?: string; // "YYYY-MM-DD"
  statementPeriod?: StatementPeriod;
  transactions: ExtractedEmailTransactionLine[];
  attachments: EmailAttachmentMeta[];
  body: string;
  confidence: number; // 0-1, extraction (not classification) confidence
}

export const EMAIL_VALIDATION_CODES = [
  "missing-amount",
  "invalid-date",
  "invalid-currency",
  "missing-required-field",
  "malformed-email",
] as const;
export type EmailValidationCode = (typeof EMAIL_VALIDATION_CODES)[number];

export interface EmailValidationError {
  code: EmailValidationCode;
  field?: string;
  message: string;
}

/**
 * The Email Registry's persisted record for one email — combines message
 * metadata, classification/extraction outcome, duplicate flag, and import
 * lineage (both newly-created and matched-existing transaction ids), the
 * same split lib/banks/types.ts's SyncRun and
 * plugins/document-intelligence/types.ts's DocumentRecord use.
 */
export interface EmailRecord {
  id: string;
  providerId: string;
  externalId: string;
  subject: string;
  sender: string;
  receivedAt: string; // ISO 8601
  emailType: EmailType;
  classificationConfidence: number;
  matchedRules: string[];
  fields: ExtractedEmailFields;
  validationErrors: EmailValidationError[];
  isDuplicate: boolean;
  duplicateOfId: string | null;
  status: EmailRecordStatus;
  /** Transactions newly created (via lib/ingestion/pipeline.ts) from this
   * email's own body-extracted lines or its attachments' DocumentRecords. */
  linkedTransactionIds: string[];
  /** Transactions this email's own body-extracted lines matched against
   * instead of creating a duplicate (e.g. a receipt email for a purchase
   * already imported via a bank statement sync). */
  matchedExistingTransactionIds: string[];
  processedAt: string; // ISO 8601
  importedAt: string | null; // ISO 8601
}

export const EMAIL_CONNECTION_STATUSES = ["connected", "disconnected", "authenticating", "error"] as const;
export type EmailConnectionStatus = (typeof EMAIL_CONNECTION_STATUSES)[number];

export const EMAIL_PROVIDER_HEALTH_STATUSES = ["healthy", "syncing", "warning", "disconnected", "error", "disabled"] as const;
export type EmailProviderHealthStatus = (typeof EMAIL_PROVIDER_HEALTH_STATUSES)[number];

export interface EmailProviderHealth {
  status: EmailProviderHealthStatus;
  message: string;
  checkedAt: string; // ISO 8601
}

export interface EmailProviderStatusSnapshot {
  connection: EmailConnectionStatus;
  message?: string;
  updatedAt: string; // ISO 8601
}

export interface EmailProviderMetadata {
  description: string;
  websiteUrl?: string;
}

/** A read-only, JSON-serializable snapshot of one provider — combines the
 * live instance's static fields with persisted enabled/health/connection
 * state, mirroring lib/banks/types.ts's ConnectorRecord. */
export interface EmailProviderRecord {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  connection: EmailConnectionStatus;
  health: EmailProviderHealth;
  lastSync: string | null; // ISO 8601
  metadata: EmailProviderMetadata;
  installedAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface EmailImportError {
  message: string;
  emailId?: string;
}

/** One full execution record — what engine.ts persists as import history,
 * mirroring lib/banks/types.ts's SyncRun. */
export interface EmailImportRun {
  id: string;
  providerId: string;
  syncType: EmailSyncType;
  status: "running" | "completed" | "failed" | "partial";
  startedAt: string; // ISO 8601
  completedAt: string | null;
  durationMs: number | null;
  emailsFetched: number;
  financialEmailsClassified: number; // classified as something other than "unknown"
  duplicatesDetected: number;
  transactionsCreated: number;
  transactionsMatched: number;
  errors: EmailImportError[];
}

export interface EmailStatistics {
  emailsImported: number;
  financialEmailsClassified: number;
  duplicatesDetected: number;
  transactionsCreated: number;
  transactionsMatched: number;
  attachmentsProcessed: number;
  importErrors: number;
  unknownEmailsCount: number;
}
