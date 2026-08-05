/**
 * Document parsing job — subscribes to ledger/document.uploaded.
 * Orchestrates plugins/document-intelligence/engine.ts::analyzeDocument
 * (OCR + classification + structured extraction, unchanged) and persists
 * via services/documents/document-service.ts. Mirrors
 * plugins/document-intelligence/pipeline.ts::processDocument's phase
 * boundary (analyze + validate + detect duplicates only) — transaction
 * mapping/ingestion from a document's extracted line items is explicitly
 * out of scope for this pass; see docs/job-platform/09-migration-plan.md §9.4.
 *
 * No real OCR provider is wired (plugins/document-intelligence/ocr.ts's
 * MockOCRProvider only recognizes fixture text by mockTextKey) — a real
 * upload has no fixture key, so extraction legitimately yields the
 * provider's own documented "nothing recognized" outcome (confidence 0,
 * empty fields) rather than fabricated data. That's a deferred provider
 * integration, not a bug in this job.
 */
import { defineJob } from "@/lib/jobs/worker";
import { dispatch } from "@/lib/jobs/dispatcher";
import { buildKey } from "@/lib/jobs/idempotency";
import { orgConcurrency, globalConcurrency } from "@/lib/jobs/queue";
import { analyzeDocument } from "@/plugins/document-intelligence/engine";
import * as documentService from "@/services/documents/document-service";
import { capture } from "@/lib/observability/analytics";
import type { EventPayload } from "@/lib/jobs/events";
import type { DocumentStatus } from "@/plugins/document-intelligence/types";

function sizeBucket(sizeBytes: number): "small" | "medium" | "large" {
  if (sizeBytes < 500_000) return "small";
  if (sizeBytes < 5_000_000) return "medium";
  return "large";
}

type Trigger = EventPayload<"ledger/document.uploaded">;

export const documentParse = defineJob<Trigger>(
  {
    id: "document-parse",
    name: "Document Parsing (OCR + Extraction)",
    trigger: { event: "ledger/document.uploaded" },
    concurrency: [orgConcurrency(3), globalConcurrency(15)],
  },
  async ({ event, organizationId, correlationId, step }) => {
    if (!organizationId) return { skipped: true };
    const { documentId, r2Key, fileName, mimeType, sizeBytes } = event.data;

    const analysis = await step.run("analyze", () =>
      analyzeDocument({
        id: documentId,
        fileName,
        mimeType,
        sizeBytes,
        uploadedAt: new Date().toISOString(),
        // No real OCR provider is wired yet — see this file's header comment.
        mockTextKey: "",
      }),
    );

    const duplicate = await step.run("find-duplicate", () =>
      documentService.findDuplicate(organizationId, analysis.classification.type, analysis.fields),
    );

    const status: DocumentStatus = duplicate ? "duplicate" : analysis.fields.rawText.trim().length > 0 ? "processed" : "failed";

    const now = new Date().toISOString();
    const record = await step.run("record", () =>
      documentService.recordDocument(organizationId, {
        id: documentId,
        fileName,
        mimeType,
        sizeBytes,
        r2Key,
        uploadedAt: now,
        documentType: analysis.classification.type,
        classificationConfidence: analysis.classification.confidence,
        matchedRules: analysis.classification.matchedRules,
        status,
        parserUsed: analysis.parserUsed,
        extractionConfidence: analysis.fields.confidence,
        extractionDurationMs: analysis.extractionDurationMs,
        fields: analysis.fields,
        validationErrors: [],
        isDuplicate: Boolean(duplicate),
        duplicateOfId: duplicate?.id ?? null,
        processedAt: now,
        importedAt: null,
      }),
    );

    await dispatch(
      "ledger/document.parsed",
      {
        organizationId,
        correlationId,
        documentId: record.id,
        extractedTransactionIds: [],
        parserUsed: record.parserUsed,
      },
      { id: buildKey("document-parsed", documentId) },
    );

    if (status === "failed") {
      capture("document_parse_failed", organizationId, { document_id: record.id, failure_reason: "no_text_extracted" });
    } else {
      capture("document_imported", organizationId, { document_type: analysis.classification.type, size_bucket: sizeBucket(sizeBytes) });
    }

    return { documentId: record.id, status: record.status, confidence: analysis.fields.confidence };
  },
);
