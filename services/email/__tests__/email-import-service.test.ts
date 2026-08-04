// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { registerEmailProvider, unregisterEmailProvider } from "@/lib/email/registry";
import type { EmailProvider } from "@/lib/email/provider";
import type { EmailImportRun, EmailRecord, ExtractedEmailFields } from "@/lib/email/types";
import {
  clearEmailRegistry,
  clearProviderState,
  computeEmailStatistics,
  findDuplicateEmail,
  getAllEmailProviderRecords,
  getAllEmails,
  getEmail,
  getEmailsByStatus,
  getEnabledEmailProviders,
  getImportHistory,
  getLatestImportRun,
  isEmailProviderEnabled,
  persistImportRun,
  recordEmail,
  recordProviderConnection,
  recordProviderHealth,
  recordProviderLastSync,
  registerProviderState,
  setEmailProviderEnabled,
  updateEmail,
  updateImportRun,
} from "@/services/email/email-import-service";

let organizationId: string;
const PROVIDER_ID = "test-gmail";

vi.setConfig({ testTimeout: 20000 });

function makeProvider(): EmailProvider {
  return {
    id: PROVIDER_ID,
    name: "Test Gmail",
    version: "1.0.0",
    connect: async () => {},
    disconnect: async () => {},
    fetchEmails: async () => [],
    health: async () => ({ status: "healthy", message: "OK", checkedAt: new Date().toISOString() }),
    status: async () => ({ connection: "connected", updatedAt: new Date().toISOString() }),
    metadata: () => ({ description: "Test provider" }),
  };
}

function makeFields(overrides: Partial<ExtractedEmailFields> = {}): ExtractedEmailFields {
  return {
    subject: "Your receipt",
    sender: "billing@merchant.com",
    transactions: [],
    attachments: [],
    body: "Thanks for your purchase",
    confidence: 0.9,
    ...overrides,
  };
}

function makeRecord(overrides: Partial<EmailRecord> = {}): EmailRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    providerId: PROVIDER_ID,
    externalId: crypto.randomUUID(),
    subject: "Your receipt",
    sender: "billing@merchant.com",
    receivedAt: now,
    emailType: "receipt",
    classificationConfidence: 0.95,
    matchedRules: ["receipt-keyword"],
    fields: makeFields(),
    validationErrors: [],
    isDuplicate: false,
    duplicateOfId: null,
    status: "processed",
    linkedTransactionIds: [],
    matchedExistingTransactionIds: [],
    processedAt: now,
    importedAt: null,
    ...overrides,
  };
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `email-import-service-test-${Date.now()}@ledgerai.local`, name: "Email Import Service Test" },
  });
  const organization = await prisma.organization.create({
    data: { name: "Email Import Service Test Org", isPersonal: true },
  });
  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
  });
  organizationId = organization.id;
}, 20000);

afterAll(async () => {
  await prisma.emailRecord.deleteMany({ where: { organizationId } });
  await prisma.emailProviderState.deleteMany({ where: { organizationId } });
  await prisma.syncJob.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  registerEmailProvider(makeProvider());
  await registerProviderState(organizationId, PROVIDER_ID);
});

afterEach(async () => {
  unregisterEmailProvider(PROVIDER_ID);
  await prisma.emailRecord.deleteMany({ where: { organizationId } });
  await prisma.emailProviderState.deleteMany({ where: { organizationId } });
  await prisma.syncJob.deleteMany({ where: { organizationId } });
});

describe("Email Import service — provider state", () => {
  it("seeds enabled=true on first registration and preserves toggles across re-registration", async () => {
    expect(await isEmailProviderEnabled(organizationId, PROVIDER_ID)).toBe(true);
    await setEmailProviderEnabled(organizationId, PROVIDER_ID, false);
    await registerProviderState(organizationId, PROVIDER_ID);
    expect(await isEmailProviderEnabled(organizationId, PROVIDER_ID)).toBe(false);
  });

  it("setEmailProviderEnabled rejects an unknown provider id", async () => {
    await expect(setEmailProviderEnabled(organizationId, "does-not-exist", true)).rejects.toThrow(
      /unknown email provider/,
    );
  });

  it("getEnabledEmailProviders reflects toggles, and getAllEmailProviderRecords surfaces persisted health/connection/lastSync", async () => {
    await setEmailProviderEnabled(organizationId, PROVIDER_ID, true);
    expect((await getEnabledEmailProviders(organizationId)).map((p) => p.id)).toContain(PROVIDER_ID);

    const health = { status: "healthy" as const, message: "All good", checkedAt: new Date().toISOString() };
    await recordProviderHealth(organizationId, PROVIDER_ID, health);
    await recordProviderConnection(organizationId, PROVIDER_ID, "connected");
    const lastSync = new Date().toISOString();
    await recordProviderLastSync(organizationId, PROVIDER_ID, lastSync);

    const records = await getAllEmailProviderRecords(organizationId);
    const record = records.find((r) => r.id === PROVIDER_ID)!;
    expect(record.health).toEqual(health);
    expect(record.connection).toBe("connected");
    expect(record.lastSync).toBe(lastSync);
  });

  it("clearProviderState wipes everything for the organization", async () => {
    await clearProviderState(organizationId);
    expect(await prisma.emailProviderState.count({ where: { organizationId } })).toBe(0);
  });
});

describe("Email Import service — records", () => {
  it("recordEmail upserts by id, then updateEmail patches in place", async () => {
    const record = makeRecord();
    await recordEmail(organizationId, record);

    const fetched = await getEmail(organizationId, record.id);
    expect(fetched?.status).toBe("processed");

    const updated = await updateEmail(organizationId, record.id, { status: "imported", linkedTransactionIds: ["tx-1"] });
    expect(updated?.status).toBe("imported");
    expect(updated?.linkedTransactionIds).toEqual(["tx-1"]);
    // Fields not in the patch survive untouched.
    expect(updated?.subject).toBe(record.subject);
  });

  it("getAllEmails and getEmailsByStatus scope correctly", async () => {
    await recordEmail(organizationId, makeRecord({ status: "processed" }));
    await recordEmail(organizationId, makeRecord({ status: "imported" }));
    await recordEmail(organizationId, makeRecord({ status: "imported" }));

    expect(await getAllEmails(organizationId)).toHaveLength(3);
    expect(await getEmailsByStatus(organizationId, "imported")).toHaveLength(2);
  });

  it("findDuplicateEmail matches by externalId first, regardless of type", async () => {
    const existing = makeRecord({ externalId: "msg-123" });
    await recordEmail(organizationId, existing);

    const found = await findDuplicateEmail(
      organizationId,
      { externalId: "msg-123", providerId: PROVIDER_ID, sender: existing.sender, receivedAt: existing.receivedAt },
      "receipt",
      makeFields(),
    );
    expect(found?.id).toBe(existing.id);
  });

  it("findDuplicateEmail matches receipt-like emails by merchant+amount within the time-window tolerance", async () => {
    const receivedAt = new Date().toISOString();
    const existing = makeRecord({
      externalId: "msg-a",
      emailType: "receipt",
      receivedAt,
      fields: makeFields({ merchant: "Swiggy", amount: 450 }),
    });
    await recordEmail(organizationId, existing);

    const found = await findDuplicateEmail(
      organizationId,
      { externalId: "msg-b", providerId: PROVIDER_ID, sender: existing.sender, receivedAt },
      "receipt",
      makeFields({ merchant: "swiggy", amount: 450 }),
    );
    expect(found?.id).toBe(existing.id);
  });

  it("findDuplicateEmail excludes rejected/failed candidates", async () => {
    const existing = makeRecord({ externalId: "msg-rejected", status: "rejected" });
    await recordEmail(organizationId, existing);

    const found = await findDuplicateEmail(
      organizationId,
      { externalId: "msg-rejected", providerId: PROVIDER_ID, sender: existing.sender, receivedAt: existing.receivedAt },
      "receipt",
      makeFields(),
    );
    expect(found).toBeUndefined();
  });

  it("computeEmailStatistics aggregates across records", async () => {
    await recordEmail(organizationId, makeRecord({ status: "imported", emailType: "receipt", isDuplicate: false, linkedTransactionIds: ["tx-1"] }));
    await recordEmail(organizationId, makeRecord({ status: "duplicate", emailType: "receipt", isDuplicate: true }));
    await recordEmail(organizationId, makeRecord({ status: "failed", emailType: "unknown" }));

    const stats = await computeEmailStatistics(organizationId);
    expect(stats.emailsImported).toBe(1);
    expect(stats.transactionsCreated).toBe(1);
    expect(stats.duplicatesDetected).toBe(1);
    expect(stats.importErrors).toBe(1);
    expect(stats.unknownEmailsCount).toBe(1);
  });

  it("clearEmailRegistry wipes everything for the organization", async () => {
    await recordEmail(organizationId, makeRecord());
    await clearEmailRegistry(organizationId);
    expect(await getAllEmails(organizationId)).toHaveLength(0);
  });
});

describe("Email Import service — import run history (translated onto SyncJob)", () => {
  function makeRun(overrides: Partial<EmailImportRun> = {}): EmailImportRun {
    return {
      id: crypto.randomUUID(),
      providerId: PROVIDER_ID,
      syncType: "manual",
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      durationMs: null,
      emailsFetched: 0,
      financialEmailsClassified: 0,
      duplicatesDetected: 0,
      transactionsCreated: 0,
      transactionsMatched: 0,
      errors: [],
      ...overrides,
    };
  }

  it("persistImportRun then updateImportRun transitions the same row rather than duplicating", async () => {
    const run = makeRun();
    await persistImportRun(organizationId, run);

    const completedAt = new Date().toISOString();
    await updateImportRun(organizationId, {
      ...run,
      status: "completed",
      completedAt,
      emailsFetched: 10,
      financialEmailsClassified: 7,
      transactionsCreated: 5,
      transactionsMatched: 2,
      duplicatesDetected: 1,
    });

    const history = await getImportHistory(organizationId, PROVIDER_ID);
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe("completed");
    expect(history[0].emailsFetched).toBe(10);
    expect(history[0].transactionsCreated).toBe(5);
    expect(history[0].transactionsMatched).toBe(2);
    expect(history[0].duplicatesDetected).toBe(1);
    expect(history[0].syncType).toBe("manual");
  });

  it("getLatestImportRun returns the most recently started run for the provider", async () => {
    const older = makeRun({ startedAt: "2026-08-01T00:00:00.000Z", status: "completed", completedAt: "2026-08-01T00:01:00.000Z" });
    const newer = makeRun({ startedAt: "2026-08-02T00:00:00.000Z", status: "completed", completedAt: "2026-08-02T00:01:00.000Z" });
    await persistImportRun(organizationId, older);
    await persistImportRun(organizationId, newer);

    const latest = await getLatestImportRun(organizationId, PROVIDER_ID);
    expect(latest?.id).toBe(newer.id);
  });

  it("preserves errors with emailId round-trip via metadata", async () => {
    const run = makeRun({
      status: "failed",
      completedAt: new Date().toISOString(),
      errors: [{ message: "Fetch failed", emailId: "email-42" }],
    });
    await persistImportRun(organizationId, run);

    const history = await getImportHistory(organizationId, PROVIDER_ID);
    expect(history[0].errors).toEqual([{ message: "Fetch failed", emailId: "email-42" }]);
  });
});
