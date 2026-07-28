/**
 * OCR Interface — the one boundary a real text-extraction provider
 * replaces. Nothing outside this file ever needs to change to add
 * Tesseract, Apple Vision, Google ML Kit, Azure Document Intelligence, AWS
 * Textract, Google Document AI, or a batch/multi-page/multi-language
 * pipeline: implement OCRProvider and pass it to engine.ts's
 * analyzeDocument() instead of MockOCRProvider. No cloud OCR, no LLM
 * vision model, and no network call happens in this milestone — every
 * provider here is deterministic and local.
 */
import { MOCK_OCR_TEXT } from "@/plugins/document-intelligence/mock-documents";
import type { OCRResult, RawDocumentFile } from "@/plugins/document-intelligence/types";

export interface OCRProvider {
  readonly id: string;
  readonly name: string;
  extractText(file: RawDocumentFile): Promise<OCRResult>;
}

/**
 * The only OCRProvider this milestone ships: looks up mock-documents.ts's
 * fixture text by `file.mockTextKey` instead of running real OCR. A real
 * provider takes the same `RawDocumentFile` and returns the same
 * `OCRResult` shape, but actually reads pixels/PDF pages.
 */
export class MockOCRProvider implements OCRProvider {
  readonly id = "mock-ocr";
  readonly name = "Mock OCR (local fixtures)";

  async extractText(file: RawDocumentFile): Promise<OCRResult> {
    const text = MOCK_OCR_TEXT[file.mockTextKey] ?? "";
    return {
      text,
      // A blank fixture models a real provider's own "nothing recognized"
      // outcome (a blank page, a corrupt scan) rather than a thrown error.
      confidence: text.trim().length === 0 ? 0 : 0.97,
      pageCount: text.includes("PAGE BREAK") ? 2 : 1,
    };
  }
}

export const defaultOCRProvider: OCRProvider = new MockOCRProvider();
