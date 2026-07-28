/**
 * The Parsing Engine — composes the OCR Interface, the Document
 * Classifier, and Parser Selection/Structured Field Extraction into a
 * single `analyzeDocument()` call. This is the only module that talks to
 * all three; pipeline.ts calls this and then owns everything downstream
 * (Validation, Duplicate Detection, Transaction Mapping, Ingestion).
 */
import { defaultOCRProvider, type OCRProvider } from "@/plugins/document-intelligence/ocr";
import { classifyDocument } from "@/plugins/document-intelligence/classifier";
import { getParser } from "@/plugins/document-intelligence/parsers";
import type { AnalysisResult, ExtractedFields, RawDocumentFile } from "@/plugins/document-intelligence/types";

/** Fields whose presence/absence feeds the extraction-confidence estimate
 * — a rough, deterministic "how much did we actually get" signal, not a
 * per-type-weighted score. Different document types populate different
 * subsets of this list by design (e.g. an Investment Statement has no
 * `invoiceNumber`), so a document is never penalized for a field its own
 * type was never going to have. */
const COMPLETENESS_FIELDS: (keyof Omit<ExtractedFields, "rawText" | "confidence">)[] = [
  "merchant",
  "amount",
  "total",
  "balance",
  "accountNumber",
  "invoiceNumber",
  "receiptNumber",
  "referenceNumber",
  "paymentMethod",
  "issueDate",
  "dueDate",
  "statementPeriod",
];

function completenessRatio(fields: Omit<ExtractedFields, "rawText" | "confidence">): number {
  const populated = COMPLETENESS_FIELDS.filter((key) => fields[key] !== undefined).length;
  return populated / COMPLETENESS_FIELDS.length;
}

/**
 * Runs OCR/Text Extraction, then Document Classification, then Parser
 * Selection + Structured Field Extraction, over one file. `ocrProvider`
 * defaults to the local mock implementation — pass a different
 * OCRProvider (Tesseract, a cloud provider, etc.) to swap it out; nothing
 * else in this function changes.
 */
export async function analyzeDocument(file: RawDocumentFile, ocrProvider: OCRProvider = defaultOCRProvider): Promise<AnalysisResult> {
  const startedAt = Date.now();

  const ocr = await ocrProvider.extractText(file);
  const classification = classifyDocument(ocr.text);
  const parser = getParser(classification.type);
  const parsed = parser(ocr.text);

  const extractionDurationMs = Date.now() - startedAt;
  const confidence = ocr.confidence * completenessRatio(parsed);

  const fields: ExtractedFields = { ...parsed, rawText: ocr.text, confidence };

  return { ocr, classification, fields, parserUsed: classification.type, extractionDurationMs };
}
