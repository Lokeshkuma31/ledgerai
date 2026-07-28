/**
 * Document Intelligence Plugin — the Plugin Framework extension. Wires
 * registry.ts's persisted documents into Feed/Search/Coach; owns no
 * parsing/validation/import logic itself (that's engine.ts/pipeline.ts,
 * both usable — and independently testable — without this file existing).
 */
import { registerFeedContributor } from "@/lib/feed/engine";
import { registerIndexContributor } from "@/lib/index";
import { registerCoachImportSummaryContributor, type CoachImportSummaryContribution } from "@/lib/coach/contributors";
import { computeStatistics, getAllDocuments } from "@/plugins/document-intelligence/registry";
import type { DocumentRecord, DocumentType } from "@/plugins/document-intelligence/types";
import type { Plugin, PluginCapability, PluginHealth } from "@/types/plugin";
import type { FeedItem } from "@/types/feed";
import type { IndexedObject } from "@/types/index";

const PLUGIN_ID = "document-intelligence";
const PLUGIN_NAME = "Document Intelligence";

const TYPE_LABELS: Record<DocumentType, string> = {
  receipt: "Receipt",
  invoice: "Invoice",
  "bank-statement": "Bank Statement",
  "credit-card-statement": "Credit Card Statement",
  "utility-bill": "Utility Bill",
  "salary-slip": "Salary Slip",
  "insurance-receipt": "Insurance Receipt",
  "investment-statement": "Investment Statement",
  "loan-statement": "Loan Statement",
  unknown: "Unknown Document",
};

// --- Feed / Search / Coach contributions -----------------------------------

/** One item per document outcome, keyed on `${doc.id}:${event}` so re-runs
 * of generateFeed() don't duplicate or lose read/dismissed state — the
 * same stable-id approach lib/banks/sync-engine.ts's feedItemForConnector
 * uses per SyncRun. Covers every event the spec names: "Receipt Imported"/
 * "Statement Imported" (the generic "<Type> Imported" below), "Duplicate
 * Receipt" (generic "Duplicate <Type>"), "Extraction Failed", and "New
 * Transactions Found" (fired alongside an import whenever it produced at
 * least one transaction). */
function buildDocumentFeedItems(): FeedItem[] {
  const items: FeedItem[] = [];

  for (const doc of getAllDocuments()) {
    const label = TYPE_LABELS[doc.documentType];
    const base = {
      priority: 0, // recomputed by lib/feed/prioritizer.ts from type/severity/confidence
      sourceEngine: "feed" as const,
      explanationId: null,
      isRead: false,
      isPinned: false,
      isDismissed: false,
      expiresAt: null,
    };

    if (doc.status === "imported") {
      items.push({
        ...base,
        id: `plugin:${PLUGIN_ID}:${doc.id}:imported`,
        type: "system-insight",
        title: `${label} Imported`,
        summary: `${doc.fileName} was classified as a ${label.toLowerCase()} and imported ${doc.linkedTransactionIds.length} transaction(s).`,
        severity: "info",
        relatedObjectIds: doc.linkedTransactionIds,
        confidence: doc.extractionConfidence,
        createdAt: doc.importedAt ?? doc.processedAt,
        metadata: { pluginId: PLUGIN_ID, documentId: doc.id, documentType: doc.documentType },
      });
      if (doc.linkedTransactionIds.length > 0) {
        items.push({
          ...base,
          id: `plugin:${PLUGIN_ID}:${doc.id}:new-transactions`,
          type: "system-insight",
          title: "New Transactions Found",
          summary: `${doc.linkedTransactionIds.length} new transaction(s) were extracted from ${doc.fileName}.`,
          severity: "info",
          relatedObjectIds: doc.linkedTransactionIds,
          confidence: doc.extractionConfidence,
          createdAt: doc.importedAt ?? doc.processedAt,
          metadata: { pluginId: PLUGIN_ID, documentId: doc.id },
        });
      }
    } else if (doc.status === "duplicate") {
      items.push({
        ...base,
        id: `plugin:${PLUGIN_ID}:${doc.id}:duplicate`,
        type: "system-insight",
        title: `Duplicate ${label}`,
        summary: `${doc.fileName} looks like a document already imported and was not re-imported.`,
        severity: "warning",
        relatedObjectIds: doc.duplicateOfId ? [doc.duplicateOfId] : [],
        confidence: 1,
        createdAt: doc.processedAt,
        metadata: { pluginId: PLUGIN_ID, documentId: doc.id, duplicateOfId: doc.duplicateOfId },
      });
    } else if (doc.status === "failed") {
      items.push({
        ...base,
        id: `plugin:${PLUGIN_ID}:${doc.id}:failed`,
        type: "system-insight",
        title: "Extraction Failed",
        summary: `${doc.fileName} could not be processed: ${doc.validationErrors[0]?.message ?? "extraction failed."}`,
        severity: "warning",
        relatedObjectIds: [],
        confidence: doc.extractionConfidence,
        createdAt: doc.processedAt,
        metadata: { pluginId: PLUGIN_ID, documentId: doc.id },
      });
    }
  }

  return items;
}

function keywordsFor(doc: DocumentRecord): string[] {
  return [doc.documentType, doc.fields.merchant, doc.fields.invoiceNumber, doc.fields.receiptNumber, doc.fields.referenceNumber].filter(
    (k): k is string => Boolean(k),
  );
}

/** Indexes documents, extracted metadata, invoice/receipt numbers,
 * statement periods, and linked transaction ids — the Financial Query
 * Engine and Financial Semantic Index need no changes to pick this up, the
 * same generic registerIndexContributor extension point every other
 * plugin uses. */
function buildDocumentIndexObjects(): IndexedObject[] {
  return getAllDocuments().map((doc) => {
    const label = TYPE_LABELS[doc.documentType];
    return {
      id: `document:${doc.id}`,
      type: "document",
      title: `${label} — ${doc.fileName}`,
      description: `Status: ${doc.status}; ${doc.linkedTransactionIds.length} linked transaction(s).`,
      keywords: keywordsFor(doc),
      merchant: doc.fields.merchant,
      amount: doc.fields.total ?? doc.fields.amount ?? doc.fields.balance,
      date: doc.fields.issueDate ?? doc.uploadedAt.slice(0, 10),
      tags: ["document", doc.documentType, doc.status],
      metadata: {
        documentId: doc.id,
        documentType: doc.documentType,
        status: doc.status,
        invoiceNumber: doc.fields.invoiceNumber,
        receiptNumber: doc.fields.receiptNumber,
        statementPeriod: doc.fields.statementPeriod,
        linkedTransactionIds: doc.linkedTransactionIds,
      },
      createdAt: doc.uploadedAt,
      updatedAt: doc.importedAt ?? doc.processedAt,
      searchableText: `${label} ${doc.fileName} ${doc.fields.merchant ?? ""} ${doc.fields.invoiceNumber ?? ""} ${doc.fields.receiptNumber ?? ""}`.toLowerCase(),
    };
  });
}

/** Structured, pre-computed facts only — the AI Financial Coach narrates
 * these counts, it never re-runs OCR/classification/extraction itself.
 * Reuses the same extension point plugins/account-aggregator/plugin.ts
 * uses rather than inventing a document-specific one. */
function getCoachSummary(): CoachImportSummaryContribution | null {
  const all = getAllDocuments();
  if (all.length === 0) return null;

  const stats = computeStatistics();
  const lastImported = all
    .filter((d) => d.importedAt)
    .sort((a, b) => (b.importedAt ?? "").localeCompare(a.importedAt ?? ""))[0];

  return {
    pluginName: PLUGIN_NAME,
    totalMessages: all.length,
    importedCount: stats.documentsImported,
    duplicateCount: stats.duplicatesPrevented,
    failedCount: all.filter((d) => d.status === "failed").length,
    lastImportAt: lastImported?.importedAt ?? null,
  };
}

// --- Plugin Framework registration ------------------------------------------

class DocumentIntelligencePlugin implements Plugin {
  readonly id = PLUGIN_ID;
  readonly name = PLUGIN_NAME;
  readonly version = "1.0.0";
  readonly author = "LedgerAI";
  readonly description =
    "Classifies financial documents deterministically, extracts structured fields through pluggable parsers, and imports resulting transactions through the existing Ingestion Pipeline. Mock OCR and rule-based classification only.";
  enabled = true;

  private unregisterFeed: (() => void) | null = null;
  private unregisterIndex: (() => void) | null = null;
  private unregisterCoach: (() => void) | null = null;

  capabilities(): PluginCapability[] {
    return ["transaction-source", "feed-generator", "search-provider"];
  }

  register(): void {
    this.unregisterFeed = registerFeedContributor(buildDocumentFeedItems);
    this.unregisterIndex = registerIndexContributor(buildDocumentIndexObjects);
    this.unregisterCoach = registerCoachImportSummaryContributor(getCoachSummary);
  }

  unregister(): void {
    this.unregisterFeed?.();
    this.unregisterIndex?.();
    this.unregisterCoach?.();
    this.unregisterFeed = null;
    this.unregisterIndex = null;
    this.unregisterCoach = null;
  }

  initialize(): void {
    // No background task to start — the dashboard's own upload/import
    // actions check `this.enabled` before calling into pipeline.ts.
  }

  shutdown(): void {
    // Nothing to tear down; pipeline.ts has no session/connection state.
  }

  async health(): Promise<PluginHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.enabled) {
      return { status: "disabled", message: "Plugin is disabled.", checkedAt };
    }
    const all = getAllDocuments();
    if (all.length === 0) {
      return { status: "warning", message: "No documents processed yet.", checkedAt };
    }
    const stats = computeStatistics();
    if (stats.ocrSuccessRate < 0.5) {
      return { status: "error", message: `OCR success rate is low (${Math.round(stats.ocrSuccessRate * 100)}%).`, checkedAt };
    }
    if (stats.parserAccuracy < 0.5) {
      return {
        status: "warning",
        message: `Parser accuracy is low (${Math.round(stats.parserAccuracy * 100)}%) — many documents are unrecognized.`,
        checkedAt,
      };
    }
    return {
      status: "healthy",
      message: `Processed ${all.length} document(s); ${stats.documentsImported} imported.`,
      checkedAt,
    };
  }
}

export const documentIntelligencePlugin: Plugin = new DocumentIntelligencePlugin();
