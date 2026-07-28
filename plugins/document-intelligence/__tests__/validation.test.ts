import { describe, expect, it } from "vitest";
import { validateFields } from "@/plugins/document-intelligence/validation";
import type { ExtractedFields } from "@/plugins/document-intelligence/types";

function baseFields(overrides: Partial<ExtractedFields> = {}): ExtractedFields {
  return { rawText: "some text", confidence: 1, transactions: [], ...overrides };
}

describe("validateFields", () => {
  it("flags malformed-document for empty raw text and nothing else", () => {
    const errors = validateFields("receipt", baseFields({ rawText: "   " }));
    expect(errors).toEqual([{ code: "malformed-document", message: expect.any(String) }]);
  });

  it("flags missing-amount when no amount/total/balance was extracted", () => {
    const errors = validateFields("receipt", baseFields({ receiptNumber: "RC-1" }));
    expect(errors.some((e) => e.code === "missing-amount")).toBe(true);
  });

  it("does not require an amount for unknown documents", () => {
    const errors = validateFields("unknown", baseFields());
    expect(errors.some((e) => e.code === "missing-amount")).toBe(false);
  });

  it("flags a negative amount", () => {
    const errors = validateFields("receipt", baseFields({ receiptNumber: "RC-1", total: -10 }));
    expect(errors.some((e) => e.code === "missing-amount" && e.field === "total")).toBe(true);
  });

  it("flags an invalid date", () => {
    const errors = validateFields("invoice", baseFields({ invoiceNumber: "INV-1", total: 100, issueDate: "2026-13-40" }));
    expect(errors.some((e) => e.code === "invalid-date" && e.field === "issueDate")).toBe(true);
  });

  it("flags an unrecognized currency code", () => {
    const errors = validateFields("receipt", baseFields({ receiptNumber: "RC-1", total: 100, currency: "XYZ" }));
    expect(errors.some((e) => e.code === "invalid-currency")).toBe(true);
  });

  it("flags a missing required identifying field per document type", () => {
    const errors = validateFields("bank-statement", baseFields({ balance: 500 }));
    expect(errors.some((e) => e.code === "missing-required-field" && e.field === "accountNumber")).toBe(true);
    expect(errors.some((e) => e.code === "missing-required-field" && e.field === "statementPeriod")).toBe(true);
  });

  it("passes a fully-populated receipt with no errors", () => {
    const errors = validateFields(
      "receipt",
      baseFields({ receiptNumber: "RC-1", total: 100, currency: "INR", issueDate: "2026-07-01" }),
    );
    expect(errors).toHaveLength(0);
  });
});
