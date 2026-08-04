// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  clearRegistry,
  computeStatistics,
  findDuplicate,
  getAllDocuments,
  getDocument,
  getDocumentDownloadUrl,
  getDocumentsByStatus,
  getDocumentUploadUrl,
  linkTransactions,
  recordDocument,
  updateDocument,
} from "@/services/documents/document-service";
import type { RecordDocumentInput } from "@/repositories/document-repository";
import type { ExtractedFields } from "@/plugins/document-intelligence/types";

let organizationId: string;

vi.setConfig({ testTimeout: 20000 });

function makeFields(overrides: Partial<ExtractedFields> = {}): ExtractedFields {
  return {
    transactions: [],
    rawText: "Freshmart receipt total 450.00",
    confidence: 0.9,
    ...overrides,
  };
}

function makeDocument(overrides: Partial<RecordDocumentInput> = {}): RecordDocumentInput {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    fileName: "receipt.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 84_200,
    uploadedAt: now,
    documentType: "receipt",
    classificationConfidence: 0.95,
    matchedRules: ["receipt-keyword"],
    parserUsed: "receipt",
    extractionConfidence: 0.9,
    extractionDurationMs: 120,
    fields: makeFields(),
    validationErrors: [],
    isDuplicate: false,
    duplicateOfId: null,
    status: "processed",
    processedAt: now,
    importedAt: null,
    r2Key: null,
    ...overrides,
  };
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `document-service-test-${Date.now()}@ledgerai.local`, name: "Document Service Test" },
  });
  const organization = await prisma.organization.create({
    data: { name: "Document Service Test Org", isPersonal: true },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
  });
  organizationId = organization.id;
}, 20000);

afterAll(async () => {
  await prisma.documentTransaction.deleteMany({ where: { document: { organizationId } } });
  await prisma.document.deleteMany({ where: { organizationId } });
  await prisma.transaction.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.documentTransaction.deleteMany({ where: { document: { organizationId } } });
  await prisma.document.deleteMany({ where: { organizationId } });
  await prisma.transaction.deleteMany({ where: { organizationId } });
});

describe("Document service", () => {
  it("recordDocument creates, then upserts the same id in place", async () => {
    const doc = makeDocument();
    const created = await recordDocument(organizationId, doc);
    expect(created.status).toBe("processed");

    const updated = await recordDocument(organizationId, { ...doc, status: "duplicate", isDuplicate: true });
    expect(updated.status).toBe("duplicate");

    const all = await getAllDocuments(organizationId);
    expect(all).toHaveLength(1);
  });

  it("updateDocument patches fields in place", async () => {
    const doc = await recordDocument(organizationId, makeDocument());
    const updated = await updateDocument(organizationId, doc.id, { status: "skipped" });
    expect(updated?.status).toBe("skipped");
  });

  it("getDocumentsByStatus scopes correctly", async () => {
    await recordDocument(organizationId, makeDocument({ status: "processed" }));
    await recordDocument(organizationId, makeDocument({ status: "imported" }));
    expect(await getDocumentsByStatus(organizationId, "imported")).toHaveLength(1);
  });

  it("findDuplicate matches by extracted id number first", async () => {
    const existing = await recordDocument(
      organizationId,
      makeDocument({ documentType: "invoice", fields: makeFields({ invoiceNumber: "INV-100", amount: 500 }) }),
    );

    const found = await findDuplicate(
      organizationId,
      "invoice",
      makeFields({ invoiceNumber: "inv-100", amount: 999 }), // different amount, same number — number wins
    );
    expect(found?.id).toBe(existing.id);
  });

  it("findDuplicate falls back to a merchant+amount+date fingerprint", async () => {
    const existing = await recordDocument(
      organizationId,
      makeDocument({
        documentType: "receipt",
        fields: makeFields({ merchant: "Freshmart", total: 450, issueDate: "2026-08-01" }),
      }),
    );

    const found = await findDuplicate(
      organizationId,
      "receipt",
      makeFields({ merchant: "freshmart", total: 450, issueDate: "2026-08-01" }),
    );
    expect(found?.id).toBe(existing.id);
  });

  it("findDuplicate excludes rejected/failed documents", async () => {
    await recordDocument(
      organizationId,
      makeDocument({
        documentType: "receipt",
        status: "rejected",
        fields: makeFields({ merchant: "Freshmart", total: 450, issueDate: "2026-08-01" }),
      }),
    );

    const found = await findDuplicate(
      organizationId,
      "receipt",
      makeFields({ merchant: "Freshmart", total: 450, issueDate: "2026-08-01" }),
    );
    expect(found).toBeUndefined();
  });

  it("linkTransactions creates real DocumentTransaction rows and marks the document imported", async () => {
    const doc = await recordDocument(organizationId, makeDocument());
    const category = await prisma.category.findUniqueOrThrow({ where: { key: "food" } });
    const tx = await prisma.transaction.create({
      data: {
        organizationId,
        amount: "450.00",
        note: "Freshmart",
        paymentMethod: "UPI",
        userCategoryId: category.id,
        reviewed: true,
        date: new Date(),
      },
    });

    const updated = await linkTransactions(organizationId, doc.id, [tx.id]);
    expect(updated.status).toBe("imported");
    expect(updated.linkedTransactionIds).toEqual([tx.id]);
    expect(updated.importedAt).not.toBeNull();

    const fetched = await getDocument(organizationId, doc.id);
    expect(fetched?.linkedTransactionIds).toEqual([tx.id]);
  });

  it("computeStatistics aggregates across documents", async () => {
    await recordDocument(organizationId, makeDocument({ status: "imported", documentType: "receipt" }));
    await recordDocument(organizationId, makeDocument({ status: "duplicate", isDuplicate: true, documentType: "receipt" }));
    await recordDocument(organizationId, makeDocument({ status: "failed", documentType: "unknown", fields: makeFields({ rawText: "" }) }));

    const stats = await computeStatistics(organizationId);
    expect(stats.documentsImported).toBe(1);
    expect(stats.duplicatesPrevented).toBe(1);
    expect(stats.unknownDocumentsCount).toBe(1);
  });

  it("clearRegistry wipes everything for the organization", async () => {
    await recordDocument(organizationId, makeDocument());
    await clearRegistry(organizationId);
    expect(await getAllDocuments(organizationId)).toHaveLength(0);
  });
});

describe("Document service — R2 wiring", () => {
  it("getDocumentUploadUrl issues a presigned PUT URL and a derived r2Key", async () => {
    const { uploadUrl, r2Key } = await getDocumentUploadUrl(organizationId, "doc-1", "receipt.jpg", "image/jpeg");
    expect(r2Key).toBe(`${organizationId}/documents/doc-1/receipt.jpg`);
    expect(uploadUrl).toContain(r2Key.split("/").map(encodeURIComponent).join("/"));
  });

  it("getDocumentDownloadUrl returns null when the document has no r2Key", async () => {
    const doc = await recordDocument(organizationId, makeDocument({ r2Key: null }));
    expect(await getDocumentDownloadUrl(organizationId, doc.id)).toBeNull();
  });

  it("getDocumentDownloadUrl returns a presigned GET URL when r2Key is set", async () => {
    const doc = await recordDocument(organizationId, makeDocument({ r2Key: `${organizationId}/documents/doc-2/receipt.jpg` }));
    const url = await getDocumentDownloadUrl(organizationId, doc.id);
    expect(url).toContain("doc-2");
  });
});
