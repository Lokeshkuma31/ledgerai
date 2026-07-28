/**
 * Engine — the public entry point that orchestrates the full email
 * pipeline: fetches from an EmailProvider, runs pipeline.ts's
 * classification/extraction/duplicate-detection over each message,
 * delegates every attachment straight to the Document Intelligence
 * Plugin (never re-implementing OCR/classification/document-parsing),
 * decides — via matcher.ts — whether a body-extracted line matches an
 * already-imported transaction or needs a new one, and never bypasses the
 * Ingestion Pipeline or the Workflow Engine. Mirrors lib/banks/sync-engine.ts's
 * role for the Bank Connector Framework.
 *
 * A high-confidence, error-free, non-duplicate email is imported
 * automatically as part of the sync (mirroring the Bank Connector
 * Framework's "sync = import" model); anything else — duplicates, low
 * confidence, validation errors — is left "processed" for the dashboard's
 * Pending Imports to review via importEmail()/skipEmail()/rejectEmail()/
 * editEmailFields(), the same manual-decision path
 * plugins/document-intelligence/pipeline.ts offers for documents.
 */
import { ingestTransaction } from "@/lib/ingestion/pipeline";
import { addTransactions, getTransactions } from "@/lib/storage";
import { runWorkflowsForTrigger } from "@/lib/workflows/engine";
import { registerFeedContributor } from "@/lib/feed/engine";
import { registerIndexContributor } from "@/lib/index";
import { registerCoachImportSummaryContributor, type CoachImportSummaryContribution } from "@/lib/coach/contributors";
import { importDocument, processDocument } from "@/plugins/document-intelligence/pipeline";
import type { RawDocumentFile } from "@/plugins/document-intelligence/types";
import { findMatchingTransaction, toIngestInput } from "@/lib/email/matcher";
import { processEmail, validateEmailFields } from "@/lib/email/pipeline";
import {
  computeEmailStatistics,
  getAllEmails,
  getEmail,
  getEmailProvider,
  isEmailProviderEnabled,
  persistImportRun,
  recordEmail,
  recordProviderConnection,
  recordProviderHealth,
  recordProviderLastSync,
  updateEmail,
  updateImportRun,
} from "@/lib/email/registry";
import type {
  AttachmentKind,
  EmailImportError,
  EmailImportRun,
  EmailProviderHealth,
  EmailRecord,
  EmailSyncType,
  EmailType,
  ExtractedEmailFields,
} from "@/lib/email/types";
import type { FeedItem } from "@/types/feed";
import type { IndexedObject } from "@/types/index";
import type { Transaction } from "@/types/transaction";

const AUTO_IMPORT_CONFIDENCE_THRESHOLD = 0.6;

function attachmentMimeType(kind: AttachmentKind): string {
  switch (kind) {
    case "pdf":
      return "application/pdf";
    case "image":
      return "image/jpeg";
    case "csv":
      return "text/csv";
    case "text":
      return "text/plain";
  }
}

function deriveHealthFromRun(run: EmailImportRun): EmailProviderHealth {
  const checkedAt = run.completedAt ?? new Date().toISOString();
  if (run.status === "running") return { status: "syncing", message: "Sync in progress.", checkedAt };
  if (run.status === "failed") return { status: "error", message: run.errors[0]?.message ?? "The last sync failed.", checkedAt };
  if (run.status === "partial") return { status: "warning", message: `The last sync completed with ${run.errors.length} error(s).`, checkedAt };
  return { status: "healthy", message: `Fetched ${run.emailsFetched} email(s), ${run.financialEmailsClassified} classified.`, checkedAt };
}

/**
 * Transaction Mapping + Ingestion Pipeline + Workflow Engine for one
 * email, shared by both the sync loop's auto-import path and the manual
 * importEmail() path so the logic exists exactly once. For each
 * body-extracted line, matcher.ts decides match-vs-new; new lines go
 * through ingestTransaction()/addTransactions() and fire the existing
 * "transaction-imported" trigger, exactly like every other source. Every
 * attachment that produced a DocumentRecord is then imported through
 * Document Intelligence's own importDocument() — its own duplicate/
 * validation/ingestion logic runs unmodified; a blocked attachment
 * (duplicate or invalid) is left for the user to resolve on /documents
 * rather than blocking the rest of the email's import.
 */
async function finalizeImport(record: EmailRecord): Promise<{ transactionIds: string[]; matchedIds: string[] }> {
  const existingTransactions = getTransactions();
  const linkedTransactionIds: string[] = [];
  const matchedExistingTransactionIds: string[] = [];
  const newTransactions: Transaction[] = [];

  for (const line of record.fields.transactions) {
    const match = findMatchingTransaction(line, record.fields.merchant, existingTransactions);
    if (match) {
      matchedExistingTransactionIds.push(match.id);
      continue;
    }
    try {
      newTransactions.push(ingestTransaction(toIngestInput(line, record.fields, record.emailType)));
    } catch {
      // A malformed line shouldn't block the rest of this email's lines.
    }
  }

  if (newTransactions.length > 0) {
    addTransactions(newTransactions);
    linkedTransactionIds.push(...newTransactions.map((t) => t.id));
    const now = new Date();
    for (const transaction of newTransactions) {
      await runWorkflowsForTrigger("transaction-imported", { transaction, transactions: [transaction] }, now);
    }
  }

  for (const attachment of record.fields.attachments) {
    if (!attachment.documentId) continue;
    try {
      const imported = await importDocument(attachment.documentId);
      linkedTransactionIds.push(...imported.linkedTransactionIds);
    } catch {
      // Duplicate/blocked attachment documents stay reviewable on /documents.
    }
  }

  return { transactionIds: linkedTransactionIds, matchedIds: matchedExistingTransactionIds };
}

const BLOCKING_CODES = new Set(["missing-amount", "malformed-email"]);

export interface EmailImportOptions {
  fieldsOverride?: Partial<ExtractedEmailFields>;
  force?: boolean;
}

export async function importEmail(emailId: string, options: EmailImportOptions = {}): Promise<EmailRecord> {
  const record = getEmail(emailId);
  if (!record) throw new Error(`Email "${emailId}" was not found in the registry.`);
  if (record.status === "imported") return record;
  if (record.isDuplicate && !options.force) {
    throw new Error("This email was flagged as a duplicate — import with force to override.");
  }

  const fields: ExtractedEmailFields = options.fieldsOverride ? { ...record.fields, ...options.fieldsOverride } : record.fields;
  const revalidation = validateEmailFields(record.emailType, fields.body, fields);
  const blocking = revalidation.filter((e) => BLOCKING_CODES.has(e.code));
  if (blocking.length > 0) {
    throw new Error(`Cannot import: ${blocking.map((e) => e.message).join(" ")}`);
  }

  const { transactionIds, matchedIds } = await finalizeImport({ ...record, fields });

  return updateEmail(emailId, {
    fields,
    validationErrors: revalidation,
    status: "imported",
    linkedTransactionIds: transactionIds,
    matchedExistingTransactionIds: matchedIds,
    importedAt: new Date().toISOString(),
  })!;
}

export function skipEmail(id: string): EmailRecord | undefined {
  return updateEmail(id, { status: "skipped" });
}

export function rejectEmail(id: string): EmailRecord | undefined {
  return updateEmail(id, { status: "rejected" });
}

/** Applies a field patch (the Email Preview's "Edit" action), then
 * re-validates against the corrected fields — mirrors
 * plugins/document-intelligence/pipeline.ts's editDocumentFields(). Does
 * not re-run Duplicate Detection: unlike a document, an email's identity
 * (externalId) never changes, so editing amount/merchant/etc. can't turn
 * a genuine duplicate into a non-duplicate or vice versa. */
export function editEmailFields(id: string, patch: Partial<ExtractedEmailFields>): EmailRecord | undefined {
  const record = getEmail(id);
  if (!record || record.status === "imported") return record;

  const fields: ExtractedEmailFields = { ...record.fields, ...patch };
  const validationErrors = validateEmailFields(record.emailType, fields.body, fields);
  return updateEmail(id, {
    fields,
    validationErrors,
    status: validationErrors.some((e) => e.code === "malformed-email") ? "failed" : record.isDuplicate ? "duplicate" : "processed",
  });
}

/**
 * Runs one fetch of `syncType` for `providerId`: Financial Email
 * Classification, Attachment Detection, Body Parsing, Structured
 * Extraction, and Duplicate Detection over every message the provider
 * returns (pipeline.ts's processEmail(), no side effects), then — for
 * every attachment with a parseable fixture — delegates to Document
 * Intelligence's processDocument() so its DocumentRecord is ready the
 * moment the email is previewed. A message with no validation errors, no
 * duplicate flag, and high classification confidence is imported
 * immediately; everything else is left for manual review.
 */
export async function runEmailSync(providerId: string, syncType: EmailSyncType): Promise<EmailImportRun> {
  if (!isEmailProviderEnabled(providerId)) {
    throw new Error(`Email provider "${providerId}" is disabled. Enable it before syncing.`);
  }
  const provider = getEmailProvider(providerId);
  if (!provider) {
    throw new Error(`Email provider "${providerId}" is not installed.`);
  }

  const startedAt = new Date();
  let run: EmailImportRun = {
    id: crypto.randomUUID(),
    providerId,
    syncType,
    status: "running",
    startedAt: startedAt.toISOString(),
    completedAt: null,
    durationMs: null,
    emailsFetched: 0,
    financialEmailsClassified: 0,
    duplicatesDetected: 0,
    transactionsCreated: 0,
    transactionsMatched: 0,
    errors: [],
  };
  persistImportRun(run);
  recordProviderHealth(providerId, deriveHealthFromRun(run));

  const errors: EmailImportError[] = [];
  let emailsFetched = 0;
  let financialEmailsClassified = 0;
  let duplicatesDetected = 0;
  let transactionsCreated = 0;
  let transactionsMatched = 0;

  try {
    const rawEmails = await provider.fetchEmails(syncType);
    recordProviderConnection(providerId, "connected");
    emailsFetched = rawEmails.length;

    for (const raw of rawEmails) {
      try {
        const analysis = processEmail(raw);
        if (analysis.classification.type !== "unknown") financialEmailsClassified += 1;
        if (analysis.duplicate) duplicatesDetected += 1;

        for (const attachment of analysis.fields.attachments) {
          const rawAttachment = raw.attachments.find((a) => a.id === attachment.id);
          if (!rawAttachment?.mockTextKey) continue;
          const documentFile: RawDocumentFile = {
            id: crypto.randomUUID(),
            fileName: rawAttachment.fileName,
            mimeType: rawAttachment.mimeType || attachmentMimeType(rawAttachment.kind),
            sizeBytes: rawAttachment.sizeBytes,
            uploadedAt: raw.receivedAt,
            mockTextKey: rawAttachment.mockTextKey,
          };
          try {
            const documentRecord = await processDocument(documentFile);
            attachment.documentId = documentRecord.id;
          } catch (error) {
            errors.push({ message: error instanceof Error ? error.message : "Attachment processing failed." });
          }
        }

        const now = new Date().toISOString();
        const record: EmailRecord = {
          id: crypto.randomUUID(),
          providerId,
          externalId: raw.externalId,
          subject: raw.subject,
          sender: raw.sender,
          receivedAt: raw.receivedAt,
          emailType: analysis.classification.type,
          classificationConfidence: analysis.classification.confidence,
          matchedRules: analysis.classification.matchedRules,
          fields: analysis.fields,
          validationErrors: analysis.validationErrors,
          isDuplicate: analysis.duplicate !== undefined,
          duplicateOfId: analysis.duplicate?.id ?? null,
          status: analysis.validationErrors.some((e) => e.code === "malformed-email") ? "failed" : analysis.duplicate ? "duplicate" : "processed",
          linkedTransactionIds: [],
          matchedExistingTransactionIds: [],
          processedAt: now,
          importedAt: null,
        };
        recordEmail(record);

        if (record.status === "processed" && record.validationErrors.length === 0 && record.classificationConfidence >= AUTO_IMPORT_CONFIDENCE_THRESHOLD) {
          try {
            const imported = await importEmail(record.id);
            transactionsCreated += imported.linkedTransactionIds.length;
            transactionsMatched += imported.matchedExistingTransactionIds.length;
          } catch (error) {
            errors.push({ message: error instanceof Error ? error.message : "Auto-import failed.", emailId: record.id });
          }
        }
      } catch (error) {
        errors.push({ message: error instanceof Error ? error.message : "Unknown email processing error." });
      }
    }

    const completedAt = new Date();
    run = {
      ...run,
      status: errors.length === 0 ? "completed" : emailsFetched > 0 ? "partial" : "failed",
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      emailsFetched,
      financialEmailsClassified,
      duplicatesDetected,
      transactionsCreated,
      transactionsMatched,
      errors,
    };
  } catch (error) {
    const completedAt = new Date();
    run = {
      ...run,
      status: "failed",
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      errors: [{ message: error instanceof Error ? error.message : "Unknown provider fetch error." }],
    };
  }

  updateImportRun(run);
  if (run.status === "completed" || run.status === "partial") {
    recordProviderLastSync(providerId, run.completedAt!);
  }
  recordProviderHealth(providerId, deriveHealthFromRun(run));
  return run;
}

// --- Feed / Search / Coach contributions -----------------------------------

const TYPE_LABELS: Record<EmailType, string> = {
  receipt: "Receipt",
  invoice: "Invoice",
  "subscription-renewal": "Subscription Renewal",
  refund: "Refund",
  "salary-slip": "Salary Slip",
  "utility-bill": "Utility Bill",
  "credit-card-statement": "Credit Card Statement",
  "bank-statement": "Bank Statement",
  "flight-booking": "Flight Booking",
  "hotel-booking": "Hotel Booking",
  insurance: "Insurance",
  loan: "Loan",
  "investment-report": "Investment Report",
  "tax-document": "Tax Document",
  unknown: "Unknown Email",
};

/** The exact titles the spec names for these five types; every other type
 * falls back to a generic "<Type> Imported", the same generalization
 * plugins/document-intelligence/plugin.ts uses for its own Feed items. */
const IMPORTED_TITLES: Partial<Record<EmailType, string>> = {
  receipt: "New Receipt Imported",
  "credit-card-statement": "Credit Card Statement Imported",
  refund: "Refund Detected",
  "subscription-renewal": "Subscription Renewal",
  "salary-slip": "Salary Slip Imported",
};

function buildEmailFeedItems(): FeedItem[] {
  const items: FeedItem[] = [];

  for (const record of getAllEmails()) {
    const label = TYPE_LABELS[record.emailType];
    const base = {
      priority: 0, // recomputed by lib/feed/prioritizer.ts
      sourceEngine: "feed" as const,
      explanationId: null,
      isRead: false,
      isPinned: false,
      isDismissed: false,
      expiresAt: null,
    };

    if (record.status === "imported") {
      const matchedNote = record.matchedExistingTransactionIds.length > 0 ? `, matched ${record.matchedExistingTransactionIds.length} existing transaction(s)` : "";
      items.push({
        ...base,
        id: `email:${record.id}:imported`,
        type: "system-insight",
        title: IMPORTED_TITLES[record.emailType] ?? `${label} Imported`,
        summary: `"${record.subject}" from ${record.sender} was classified as a ${label.toLowerCase()} and imported ${record.linkedTransactionIds.length} transaction(s)${matchedNote}.`,
        severity: "info",
        relatedObjectIds: [...record.linkedTransactionIds, ...record.matchedExistingTransactionIds],
        confidence: record.classificationConfidence,
        createdAt: record.importedAt ?? record.processedAt,
        metadata: { providerId: record.providerId, emailId: record.id, emailType: record.emailType },
      });
    } else if (record.status === "duplicate") {
      items.push({
        ...base,
        id: `email:${record.id}:duplicate`,
        type: "system-insight",
        title: `Duplicate ${label}`,
        summary: `"${record.subject}" from ${record.sender} looks like an email already imported and was not re-imported.`,
        severity: "warning",
        relatedObjectIds: record.duplicateOfId ? [record.duplicateOfId] : [],
        confidence: 1,
        createdAt: record.processedAt,
        metadata: { providerId: record.providerId, emailId: record.id, duplicateOfId: record.duplicateOfId },
      });
    } else if (record.status === "failed") {
      items.push({
        ...base,
        id: `email:${record.id}:failed`,
        type: "system-insight",
        title: "Import Errors",
        summary: `"${record.subject}" could not be processed: ${record.validationErrors[0]?.message ?? "extraction failed."}`,
        severity: "warning",
        relatedObjectIds: [],
        confidence: record.classificationConfidence,
        createdAt: record.processedAt,
        metadata: { providerId: record.providerId, emailId: record.id },
      });
    }
  }

  return items;
}

function buildEmailIndexObjects(): IndexedObject[] {
  return getAllEmails().map((record) => {
    const label = TYPE_LABELS[record.emailType];
    return {
      id: `email:${record.id}`,
      type: "email",
      title: `${label} — ${record.subject}`,
      description: `From ${record.sender}; status: ${record.status}; ${record.linkedTransactionIds.length} linked transaction(s).`,
      keywords: [record.emailType, record.sender, record.fields.merchant, record.fields.invoiceNumber, record.fields.referenceNumber].filter(
        (k): k is string => Boolean(k),
      ),
      merchant: record.fields.merchant,
      amount: record.fields.amount,
      date: record.receivedAt.slice(0, 10),
      tags: ["email", record.emailType, record.status],
      metadata: {
        emailId: record.id,
        providerId: record.providerId,
        emailType: record.emailType,
        subject: record.subject,
        sender: record.sender,
        invoiceNumber: record.fields.invoiceNumber,
        statementPeriod: record.fields.statementPeriod,
        attachments: record.fields.attachments.map((a) => ({ fileName: a.fileName, documentId: a.documentId })),
        linkedTransactionIds: record.linkedTransactionIds,
      },
      createdAt: record.receivedAt,
      updatedAt: record.importedAt ?? record.processedAt,
      searchableText: `${label} ${record.subject} ${record.sender} ${record.fields.merchant ?? ""} ${record.fields.invoiceNumber ?? ""}`.toLowerCase(),
    };
  });
}

/** Structured, pre-computed facts only — the AI Financial Coach narrates
 * these counts, it never parses a raw email itself. The type-by-type
 * breakdown the spec's example sentence implies ("two receipts, one
 * refund...") is already available to the Coach through the Feed items
 * above (each with a type-specific title) via the existing
 * FeedCoachSummary pathway — no new Coach extension point is needed. */
function getCoachSummary(): CoachImportSummaryContribution | null {
  const all = getAllEmails();
  if (all.length === 0) return null;

  const stats = computeEmailStatistics();
  const lastImported = all.filter((r) => r.importedAt).sort((a, b) => (b.importedAt ?? "").localeCompare(a.importedAt ?? ""))[0];

  return {
    pluginName: "Email Intelligence",
    totalMessages: all.length,
    importedCount: stats.emailsImported,
    duplicateCount: stats.duplicatesDetected,
    failedCount: all.filter((r) => r.status === "failed").length,
    lastImportAt: lastImported?.importedAt ?? null,
  };
}

registerFeedContributor(buildEmailFeedItems);
registerIndexContributor(buildEmailIndexObjects);
registerCoachImportSummaryContributor(getCoachSummary);
