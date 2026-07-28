import { describe, expect, it } from "vitest";
import { classifyDocument } from "@/plugins/document-intelligence/classifier";
import { MOCK_OCR_TEXT } from "@/plugins/document-intelligence/mock-documents";

describe("classifyDocument", () => {
  it("classifies every known fixture as its own document type with matched rules", () => {
    const expected: Record<string, string> = {
      receipt: "receipt",
      invoice: "invoice",
      "bank-statement": "bank-statement",
      "credit-card-statement": "credit-card-statement",
      "utility-bill": "utility-bill",
      "salary-slip": "salary-slip",
      "insurance-receipt": "insurance-receipt",
      "investment-statement": "investment-statement",
      "loan-statement": "loan-statement",
    };
    for (const [key, type] of Object.entries(expected)) {
      const result = classifyDocument(MOCK_OCR_TEXT[key]);
      expect(result.type, `fixture "${key}"`).toBe(type);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.matchedRules.length).toBeGreaterThan(0);
    }
  });

  it("returns unknown with zero confidence for text matching no rules", () => {
    const result = classifyDocument(MOCK_OCR_TEXT["unknown-document"]);
    expect(result.type).toBe("unknown");
    expect(result.confidence).toBe(0);
    expect(result.matchedRules).toHaveLength(0);
  });

  it("returns unknown for empty text", () => {
    const result = classifyDocument("");
    expect(result.type).toBe("unknown");
    expect(result.confidence).toBe(0);
  });

  it("classifies a weakly-worded receipt as receipt with low confidence", () => {
    const result = classifyDocument(MOCK_OCR_TEXT["malformed-receipt"]);
    expect(result.type).toBe("receipt");
    expect(result.confidence).toBeLessThan(0.5);
  });
});
