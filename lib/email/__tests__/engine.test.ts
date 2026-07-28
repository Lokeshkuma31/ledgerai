import { beforeEach, describe, expect, it } from "vitest";
import "@/plugins/gmail/plugin";
import { createGmailProvider, GMAIL_PROVIDER_ID } from "@/plugins/gmail/plugin";
import {
  clearEmailRegistry,
  clearImportRuns,
  clearProviderState,
  getAllEmails,
  getEmailProvider,
  registerEmailProvider,
  setEmailProviderEnabled,
  unregisterEmailProvider,
} from "@/lib/email/registry";
import { editEmailFields, importEmail, runEmailSync } from "@/lib/email/engine";
import { clearRegistry as clearDocumentRegistry } from "@/plugins/document-intelligence/registry";
import type { EmailSyncType } from "@/lib/email/types";

function reset() {
  localStorage.clear();
  clearEmailRegistry();
  clearImportRuns();
  clearProviderState();
  clearDocumentRegistry();
  setEmailProviderEnabled(GMAIL_PROVIDER_ID, true);
}

async function sync(syncType: EmailSyncType = "full") {
  await getEmailProvider(GMAIL_PROVIDER_ID)!.connect();
  return runEmailSync(GMAIL_PROVIDER_ID, syncType);
}

function findBySubject(needle: string) {
  return getAllEmails().find((e) => e.subject.includes(needle));
}

describe("Email Intelligence Framework", () => {
  beforeEach(reset);

  it("Amazon Receipt: classifies as receipt, extracts the total, and auto-imports one transaction", async () => {
    const run = await sync();
    expect(run.status).toBe("completed");

    const record = findBySubject("Amazon.in Order Confirmation")!;
    expect(record.emailType).toBe("receipt");
    expect(record.classificationConfidence).toBeGreaterThan(0.5);
    expect(record.fields.amount).toBeCloseTo(799);
    expect(record.status).toBe("imported");
    expect(record.linkedTransactionIds).toHaveLength(1);
  });

  it("Flipkart Invoice: extracts invoice number and total, and auto-imports", async () => {
    await sync();
    const record = findBySubject("Invoice for Your Flipkart")!;
    expect(record.emailType).toBe("invoice");
    expect(record.fields.invoiceNumber).toBe("FA-2026-778812");
    expect(record.fields.amount).toBeCloseTo(2499);
    expect(record.status).toBe("imported");
  });

  it("Credit Card Statement: classifies, processes its attachment through Document Intelligence, and imports its transactions", async () => {
    await sync();
    const record = findBySubject("Credit Card Statement")!;
    expect(record.emailType).toBe("credit-card-statement");
    expect(record.fields.statementPeriod).toEqual({ start: "2026-06-06", end: "2026-07-05" });
    expect(record.fields.attachments).toHaveLength(1);
    expect(record.fields.attachments[0].documentId).not.toBeNull();
    expect(record.status).toBe("imported");
    // Body-only extraction produces no line items for a statement email —
    // every linked transaction here comes from the attachment's own
    // DocumentRecord (Myntra + Dominos, per document-intelligence's own fixture).
    expect(record.linkedTransactionIds.length).toBeGreaterThanOrEqual(2);
  });

  it("Salary Slip: extracts pay period and net pay from the body, plus the attachment's own transaction", async () => {
    await sync();
    const record = findBySubject("Payslip for July 2026")!;
    expect(record.emailType).toBe("salary-slip");
    expect(record.fields.statementPeriod).toEqual({ start: "2026-07-01", end: "2026-07-31" });
    expect(record.fields.amount).toBeCloseTo(56200);
    expect(record.fields.attachments[0].documentId).not.toBeNull();
    expect(record.status).toBe("imported");
    expect(record.linkedTransactionIds.length).toBeGreaterThanOrEqual(1);
  });

  it("Utility Bill: extracts amount due and due date, plus the attachment's own transaction", async () => {
    await sync();
    const record = findBySubject("Utility Bill")!;
    expect(record.emailType).toBe("utility-bill");
    expect(record.fields.amount).toBeCloseTo(1450);
    expect(record.fields.dueDate).toBe("2026-07-15");
    expect(record.status).toBe("imported");
  });

  it("Refund: classifies as refund and maps to a credit-direction transaction", async () => {
    await sync();
    const record = findBySubject("Refund Has Been Processed")!;
    expect(record.emailType).toBe("refund");
    expect(record.fields.amount).toBeCloseTo(499);
    expect(record.fields.transactions[0].direction).toBe("credit");
    expect(record.status).toBe("imported");
  });

  it("Subscription Renewal: extracts amount charged and next billing date", async () => {
    await sync();
    const record = findBySubject("Netflix Subscription")!;
    expect(record.emailType).toBe("subscription-renewal");
    expect(record.fields.amount).toBeCloseTo(649);
    expect(record.fields.dueDate).toBe("2026-08-14");
    expect(record.status).toBe("imported");
  });

  it("Unknown Email: classified unknown with zero confidence and never auto-imported", async () => {
    await sync();
    const record = findBySubject("Foodblog Weekly")!;
    expect(record.emailType).toBe("unknown");
    expect(record.classificationConfidence).toBe(0);
    expect(record.status).toBe("processed");
  });

  it("Malformed Email: weakly classified as receipt but missing an amount, blocked from import", async () => {
    await sync();
    const record = findBySubject("Receipt from QuickMart")!;
    expect(record.emailType).toBe("receipt");
    expect(record.fields.amount).toBeUndefined();
    expect(record.status).toBe("processed");
    expect(record.validationErrors.some((e) => e.code === "missing-amount")).toBe(true);

    await expect(importEmail(record.id)).rejects.toThrow(/cannot import/i);
  });

  it("Empty Email: no body content is reported as failed and blocked from import", async () => {
    await sync();
    const record = getAllEmails().find((e) => e.sender === "mailer-daemon@mail.example")!;
    expect(record.status).toBe("failed");
    expect(record.validationErrors).toEqual([{ code: "malformed-email", message: expect.any(String) }]);

    await expect(importEmail(record.id)).rejects.toThrow(/cannot import/i);
  });

  it("Duplicate Email: a repeated fetch of the same message is flagged and blocked without force", async () => {
    await sync();
    const first = findBySubject("Amazon.in Order Confirmation")!;
    expect(first.status).toBe("imported");

    await sync(); // "full" always returns the same fixed fixture list
    const both = getAllEmails().filter((e) => e.externalId === "gmail-msg-001");
    expect(both).toHaveLength(2);
    const second = both.find((e) => e.id !== first.id)!;
    expect(second.isDuplicate).toBe(true);
    expect(second.duplicateOfId).toBe(first.id);
    expect(second.status).toBe("duplicate");

    await expect(importEmail(second.id)).rejects.toThrow(/duplicate/i);
    const forced = await importEmail(second.id, { force: true });
    expect(forced.status).toBe("imported");
  });

  it("editEmailFields: fixing a missing amount turns a blocked import into a successful one", async () => {
    await sync();
    const malformed = findBySubject("Receipt from QuickMart")!;

    const edited = editEmailFields(malformed.id, {
      amount: 250,
      transactions: [{ description: "QuickMart", amount: 250, date: "2026-07-11", direction: "debit" }],
    })!;
    expect(edited.validationErrors.some((e) => e.code === "missing-amount")).toBe(false);

    const imported = await importEmail(edited.id);
    expect(imported.status).toBe("imported");
    expect(imported.linkedTransactionIds).toHaveLength(1);
  });

  it("records a failed EmailImportRun when the provider's fetchEmails() rejects", async () => {
    unregisterEmailProvider(GMAIL_PROVIDER_ID);
    registerEmailProvider(createGmailProvider({ failFetch: true }));
    setEmailProviderEnabled(GMAIL_PROVIDER_ID, true);

    const run = await sync();
    expect(run.status).toBe("failed");
    expect(run.errors[0].message).toMatch(/simulated upstream outage/i);
  });

  it("rejects a sync attempt on a disabled provider", async () => {
    setEmailProviderEnabled(GMAIL_PROVIDER_ID, false);
    await expect(runEmailSync(GMAIL_PROVIDER_ID, "manual")).rejects.toThrow(/disabled/i);
  });
});
