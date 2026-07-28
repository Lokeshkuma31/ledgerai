import { beforeEach, describe, expect, it } from "vitest";
import { clearRegistry } from "@/plugins/document-intelligence/registry";
import { editDocumentFields, importDocument, processDocument } from "@/plugins/document-intelligence/pipeline";
import { SAMPLE_DOCUMENTS, type SampleDocument } from "@/plugins/document-intelligence/mock-documents";
import type { RawDocumentFile } from "@/plugins/document-intelligence/types";

function fileFor(id: string): RawDocumentFile {
  const sample = SAMPLE_DOCUMENTS.find((s: SampleDocument) => s.id === id);
  if (!sample) throw new Error(`Unknown sample document "${id}"`);
  return { id: crypto.randomUUID(), fileName: sample.fileName, mimeType: sample.mimeType, sizeBytes: sample.sizeBytes, uploadedAt: new Date().toISOString(), mockTextKey: sample.mockTextKey };
}

describe("Document Intelligence pipeline", () => {
  beforeEach(() => {
    localStorage.clear();
    clearRegistry();
  });

  it("Receipt: classifies, extracts fields, and imports one transaction", async () => {
    const record = await processDocument(fileFor("sample-receipt"));
    expect(record.documentType).toBe("receipt");
    expect(record.classificationConfidence).toBeGreaterThan(0);
    expect(record.fields.total).toBeCloseTo(180.85);
    expect(record.fields.receiptNumber).toBe("RC-58231");
    expect(record.status).toBe("processed");

    const imported = await importDocument(record.id);
    expect(imported.status).toBe("imported");
    expect(imported.linkedTransactionIds).toHaveLength(1);
  });

  it("Invoice: extracts invoice number, due date, and total", async () => {
    const record = await processDocument(fileFor("sample-invoice"));
    expect(record.documentType).toBe("invoice");
    expect(record.fields.invoiceNumber).toBe("INV-2026-0042");
    expect(record.fields.total).toBeCloseTo(17700);
    expect(record.fields.dueDate).toBe("2026-07-15");

    const imported = await importDocument(record.id);
    expect(imported.linkedTransactionIds).toHaveLength(1);
  });

  it("Bank Statement: extracts account number, statement period, balance, and every transaction row", async () => {
    const record = await processDocument(fileFor("sample-bank-statement"));
    expect(record.documentType).toBe("bank-statement");
    expect(record.fields.accountNumber).toBe("XXXX2210");
    expect(record.fields.statementPeriod).toEqual({ start: "2026-06-01", end: "2026-06-30" });
    expect(record.fields.balance).toBeCloseTo(62150.75);
    expect(record.fields.transactions).toHaveLength(4);

    const imported = await importDocument(record.id);
    expect(imported.linkedTransactionIds).toHaveLength(4);
  });

  it("Utility Bill: extracts account number, amount due, and due date", async () => {
    const record = await processDocument(fileFor("sample-utility-bill"));
    expect(record.documentType).toBe("utility-bill");
    expect(record.fields.accountNumber).toBe("XXXX7734");
    expect(record.fields.total).toBeCloseTo(1450);
    expect(record.fields.dueDate).toBe("2026-07-15");

    const imported = await importDocument(record.id);
    expect(imported.linkedTransactionIds).toHaveLength(1);
  });

  it("Salary Slip: extracts pay period, gross pay, deductions, and net pay", async () => {
    const record = await processDocument(fileFor("sample-salary-slip"));
    expect(record.documentType).toBe("salary-slip");
    expect(record.fields.statementPeriod).toEqual({ start: "2026-07-01", end: "2026-07-31" });
    expect(record.fields.amount).toBeCloseTo(60000);
    expect(record.fields.tax).toBeCloseTo(3800);
    expect(record.fields.total).toBeCloseTo(56200);

    const imported = await importDocument(record.id);
    expect(imported.linkedTransactionIds).toHaveLength(1);
  });

  it("Malformed Receipt: classified but missing amount, and blocked from import", async () => {
    const record = await processDocument(fileFor("sample-malformed-receipt"));
    expect(record.documentType).toBe("receipt");
    expect(record.fields.total).toBeUndefined();
    expect(record.status).toBe("processed");
    expect(record.validationErrors.some((e) => e.code === "missing-amount")).toBe(true);
    expect(record.validationErrors.some((e) => e.code === "missing-required-field")).toBe(true);

    await expect(importDocument(record.id)).rejects.toThrow(/cannot import/i);
  });

  it("Duplicate Receipt: the second identical upload is flagged and blocked without force", async () => {
    const first = await processDocument(fileFor("sample-receipt"));
    await importDocument(first.id);

    const second = await processDocument(fileFor("sample-receipt"));
    expect(second.isDuplicate).toBe(true);
    expect(second.duplicateOfId).toBe(first.id);
    expect(second.status).toBe("duplicate");

    await expect(importDocument(second.id)).rejects.toThrow(/duplicate/i);

    const forced = await importDocument(second.id, { force: true });
    expect(forced.status).toBe("imported");
    expect(forced.linkedTransactionIds).toHaveLength(1);
  });

  it("Unknown Document: classified unknown with zero confidence and no importable transactions", async () => {
    const record = await processDocument(fileFor("sample-unknown-document"));
    expect(record.documentType).toBe("unknown");
    expect(record.classificationConfidence).toBe(0);
    expect(record.status).toBe("processed");

    await expect(importDocument(record.id)).rejects.toThrow(/no valid transactions/i);
  });

  it("Empty Document: no extractable text is reported as failed and blocked from import", async () => {
    const record = await processDocument(fileFor("sample-empty-document"));
    expect(record.status).toBe("failed");
    expect(record.validationErrors).toEqual([{ code: "malformed-document", message: expect.any(String) }]);

    await expect(importDocument(record.id)).rejects.toThrow(/cannot import/i);
  });

  it("Multiple Receipts: one scanned page yields two transaction lines", async () => {
    const record = await processDocument(fileFor("sample-multiple-receipts"));
    expect(record.documentType).toBe("receipt");
    expect(record.fields.merchant).toBe("FreshMart Supermarket");
    expect(record.fields.transactions).toHaveLength(2);
    expect(record.fields.transactions[0].amount).toBeCloseTo(180.85);
    expect(record.fields.transactions[1].amount).toBeCloseTo(240);

    const imported = await importDocument(record.id);
    expect(imported.linkedTransactionIds).toHaveLength(2);
  });

  it("editDocumentFields: fixing a missing field turns a blocked import into a successful one", async () => {
    const record = await processDocument(fileFor("sample-malformed-receipt"));
    expect(record.validationErrors.some((e) => e.code === "missing-amount")).toBe(true);

    const edited = editDocumentFields(record.id, { total: 99.5 })!;
    expect(edited.validationErrors.some((e) => e.code === "missing-amount")).toBe(false);

    const imported = await importDocument(edited.id);
    expect(imported.status).toBe("imported");
    expect(imported.linkedTransactionIds).toHaveLength(1);
  });
});
