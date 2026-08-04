/**
 * Email Repository — Postgres-backed persistence for
 * lib/email/registry.ts's persisted halves: provider state
 * (EmailProviderState) and processed email records (EmailRecord). Live
 * provider instances (lib/email/provider.ts objects — not serializable)
 * stay exactly where they are, in lib/email/registry.ts's in-memory
 * `instances` Map, re-registered every cold start by plugins/gmail/plugin.ts.
 * Import-run history is NOT here — it reuses
 * repositories/sync-job-repository.ts (category EMAIL_IMPORT) via
 * services/email/email-import-service.ts's own translation, rather than a
 * third near-duplicate history table.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/src/generated/prisma/client";
import type {
  EmailConnectionStatus,
  EmailProviderHealth,
  EmailRecord,
  EmailRecordStatus as AppEmailRecordStatus,
  EmailType,
  EmailValidationError,
  ExtractedEmailFields,
} from "@/lib/email/types";
import type {
  EmailProviderConnectionStatus as PrismaEmailProviderConnectionStatus,
  EmailProviderState as PrismaEmailProviderState,
  EmailIntelligenceType as PrismaEmailIntelligenceType,
  EmailRecord as PrismaEmailRecord,
  EmailRecordStatus as PrismaEmailRecordStatus,
} from "@/src/generated/prisma/client";

const CONNECTION_STATUS_TO_DB: Record<EmailConnectionStatus, PrismaEmailProviderConnectionStatus> = {
  connected: "CONNECTED",
  disconnected: "DISCONNECTED",
  authenticating: "AUTHENTICATING",
  error: "ERROR",
};
const CONNECTION_STATUS_FROM_DB: Record<PrismaEmailProviderConnectionStatus, EmailConnectionStatus> = {
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  AUTHENTICATING: "authenticating",
  ERROR: "error",
};

const EMAIL_TYPE_TO_DB: Record<EmailType, PrismaEmailIntelligenceType> = {
  receipt: "RECEIPT",
  invoice: "INVOICE",
  "subscription-renewal": "SUBSCRIPTION_RENEWAL",
  refund: "REFUND",
  "salary-slip": "SALARY_SLIP",
  "utility-bill": "UTILITY_BILL",
  "credit-card-statement": "CREDIT_CARD_STATEMENT",
  "bank-statement": "BANK_STATEMENT",
  "flight-booking": "FLIGHT_BOOKING",
  "hotel-booking": "HOTEL_BOOKING",
  insurance: "INSURANCE",
  loan: "LOAN",
  "investment-report": "INVESTMENT_REPORT",
  "tax-document": "TAX_DOCUMENT",
  unknown: "UNKNOWN",
};
const EMAIL_TYPE_FROM_DB: Record<PrismaEmailIntelligenceType, EmailType> = {
  RECEIPT: "receipt",
  INVOICE: "invoice",
  SUBSCRIPTION_RENEWAL: "subscription-renewal",
  REFUND: "refund",
  SALARY_SLIP: "salary-slip",
  UTILITY_BILL: "utility-bill",
  CREDIT_CARD_STATEMENT: "credit-card-statement",
  BANK_STATEMENT: "bank-statement",
  FLIGHT_BOOKING: "flight-booking",
  HOTEL_BOOKING: "hotel-booking",
  INSURANCE: "insurance",
  LOAN: "loan",
  INVESTMENT_REPORT: "investment-report",
  TAX_DOCUMENT: "tax-document",
  UNKNOWN: "unknown",
};

const RECORD_STATUS_TO_DB: Record<AppEmailRecordStatus, PrismaEmailRecordStatus> = {
  processed: "PROCESSED",
  duplicate: "DUPLICATE",
  imported: "IMPORTED",
  skipped: "SKIPPED",
  rejected: "REJECTED",
  failed: "FAILED",
};
const RECORD_STATUS_FROM_DB: Record<PrismaEmailRecordStatus, AppEmailRecordStatus> = {
  PROCESSED: "processed",
  DUPLICATE: "duplicate",
  IMPORTED: "imported",
  SKIPPED: "skipped",
  REJECTED: "rejected",
  FAILED: "failed",
};

// --- provider state ---------------------------------------------------------

export interface PersistedProviderState {
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
  lastHealth?: EmailProviderHealth;
  lastConnection?: EmailConnectionStatus;
  lastSync?: string | null;
}

function toProviderState(row: PrismaEmailProviderState): PersistedProviderState {
  return {
    enabled: row.enabled,
    installedAt: row.installedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastHealth: (row.lastHealth as unknown as EmailProviderHealth | null) ?? undefined,
    lastConnection: row.lastConnection ? CONNECTION_STATUS_FROM_DB[row.lastConnection] : undefined,
    lastSync: row.lastSyncAt?.toISOString() ?? null,
  };
}

export async function getProviderState(
  organizationId: string,
  providerId: string,
): Promise<PersistedProviderState | undefined> {
  const row = await prisma.emailProviderState.findUnique({
    where: { organizationId_providerId: { organizationId, providerId } },
  });
  return row ? toProviderState(row) : undefined;
}

export async function getAllProviderStates(
  organizationId: string,
): Promise<Record<string, PersistedProviderState>> {
  const rows = await prisma.emailProviderState.findMany({ where: { organizationId } });
  return Object.fromEntries(rows.map((row) => [row.providerId, toProviderState(row)]));
}

/** Seeds default state on first registration only — mirrors
 * lib/email/registry.ts::registerEmailProvider's `if (!state[id])` guard. */
export async function ensureProviderRegistered(
  organizationId: string,
  providerId: string,
): Promise<void> {
  await prisma.emailProviderState.upsert({
    where: { organizationId_providerId: { organizationId, providerId } },
    create: { organizationId, providerId, enabled: true },
    update: {},
  });
}

export async function setProviderEnabled(
  organizationId: string,
  providerId: string,
  enabled: boolean,
): Promise<void> {
  await prisma.emailProviderState.upsert({
    where: { organizationId_providerId: { organizationId, providerId } },
    create: { organizationId, providerId, enabled },
    update: { enabled },
  });
}

export async function recordProviderHealth(
  organizationId: string,
  providerId: string,
  health: EmailProviderHealth,
): Promise<void> {
  await prisma.emailProviderState.upsert({
    where: { organizationId_providerId: { organizationId, providerId } },
    create: { organizationId, providerId, lastHealth: health as unknown as Prisma.InputJsonValue },
    update: { lastHealth: health as unknown as Prisma.InputJsonValue },
  });
}

export async function recordProviderConnection(
  organizationId: string,
  providerId: string,
  connection: EmailConnectionStatus,
): Promise<void> {
  const dbValue = CONNECTION_STATUS_TO_DB[connection];
  await prisma.emailProviderState.upsert({
    where: { organizationId_providerId: { organizationId, providerId } },
    create: { organizationId, providerId, lastConnection: dbValue },
    update: { lastConnection: dbValue },
  });
}

export async function recordProviderLastSync(
  organizationId: string,
  providerId: string,
  lastSyncIso: string,
): Promise<void> {
  await prisma.emailProviderState.upsert({
    where: { organizationId_providerId: { organizationId, providerId } },
    create: { organizationId, providerId, lastSyncAt: new Date(lastSyncIso) },
    update: { lastSyncAt: new Date(lastSyncIso) },
  });
}

export async function clearProviderState(organizationId: string): Promise<void> {
  await prisma.emailProviderState.deleteMany({ where: { organizationId } });
}

// --- email records ------------------------------------------------------------

function toEmailRecord(row: PrismaEmailRecord): EmailRecord {
  return {
    id: row.id,
    providerId: row.providerId,
    externalId: row.externalId,
    subject: row.subject,
    sender: row.sender,
    receivedAt: row.receivedAt.toISOString(),
    emailType: EMAIL_TYPE_FROM_DB[row.emailType],
    classificationConfidence: row.classificationConfidence,
    matchedRules: row.matchedRules,
    fields: row.fields as unknown as ExtractedEmailFields,
    validationErrors: row.validationErrors as unknown as EmailValidationError[],
    isDuplicate: row.isDuplicate,
    duplicateOfId: row.duplicateOfId,
    status: RECORD_STATUS_FROM_DB[row.status],
    linkedTransactionIds: row.linkedTransactionIds,
    matchedExistingTransactionIds: row.matchedExistingTransactionIds,
    processedAt: row.processedAt.toISOString(),
    importedAt: row.importedAt?.toISOString() ?? null,
  };
}

/** Upserts by id, mirroring lib/email/registry.ts::recordEmail's
 * find-or-append semantics. */
export async function recordEmail(
  organizationId: string,
  record: EmailRecord,
): Promise<EmailRecord> {
  const data = {
    organizationId,
    providerId: record.providerId,
    externalId: record.externalId,
    subject: record.subject,
    sender: record.sender,
    receivedAt: new Date(record.receivedAt),
    emailType: EMAIL_TYPE_TO_DB[record.emailType],
    classificationConfidence: record.classificationConfidence,
    matchedRules: record.matchedRules,
    fields: record.fields as unknown as Prisma.InputJsonValue,
    validationErrors: record.validationErrors as unknown as Prisma.InputJsonValue[],
    isDuplicate: record.isDuplicate,
    duplicateOfId: record.duplicateOfId,
    status: RECORD_STATUS_TO_DB[record.status],
    linkedTransactionIds: record.linkedTransactionIds,
    matchedExistingTransactionIds: record.matchedExistingTransactionIds,
    processedAt: new Date(record.processedAt),
    importedAt: record.importedAt ? new Date(record.importedAt) : null,
  };
  const row = await prisma.emailRecord.upsert({
    where: { id: record.id },
    create: { id: record.id, ...data },
    update: data,
  });
  return toEmailRecord(row);
}

export async function updateEmail(
  organizationId: string,
  id: string,
  patch: Partial<Omit<EmailRecord, "id" | "providerId" | "externalId">>,
): Promise<EmailRecord | undefined> {
  const data: Record<string, unknown> = {};
  if (patch.subject !== undefined) data.subject = patch.subject;
  if (patch.sender !== undefined) data.sender = patch.sender;
  if (patch.receivedAt !== undefined) data.receivedAt = new Date(patch.receivedAt);
  if (patch.emailType !== undefined) data.emailType = EMAIL_TYPE_TO_DB[patch.emailType];
  if (patch.classificationConfidence !== undefined) data.classificationConfidence = patch.classificationConfidence;
  if (patch.matchedRules !== undefined) data.matchedRules = patch.matchedRules;
  if (patch.fields !== undefined) data.fields = patch.fields as unknown as Prisma.InputJsonValue;
  if (patch.validationErrors !== undefined)
    data.validationErrors = patch.validationErrors as unknown as Prisma.InputJsonValue[];
  if (patch.isDuplicate !== undefined) data.isDuplicate = patch.isDuplicate;
  if (patch.duplicateOfId !== undefined) data.duplicateOfId = patch.duplicateOfId;
  if (patch.status !== undefined) data.status = RECORD_STATUS_TO_DB[patch.status];
  if (patch.linkedTransactionIds !== undefined) data.linkedTransactionIds = patch.linkedTransactionIds;
  if (patch.matchedExistingTransactionIds !== undefined)
    data.matchedExistingTransactionIds = patch.matchedExistingTransactionIds;
  if (patch.importedAt !== undefined)
    data.importedAt = patch.importedAt ? new Date(patch.importedAt) : null;

  const { count } = await prisma.emailRecord.updateMany({
    where: { id, organizationId },
    data,
  });
  if (count === 0) return undefined;
  const row = await prisma.emailRecord.findUniqueOrThrow({ where: { id } });
  return toEmailRecord(row);
}

export async function getEmail(
  organizationId: string,
  id: string,
): Promise<EmailRecord | undefined> {
  const row = await prisma.emailRecord.findFirst({ where: { id, organizationId } });
  return row ? toEmailRecord(row) : undefined;
}

export async function getAllEmails(organizationId: string): Promise<EmailRecord[]> {
  const rows = await prisma.emailRecord.findMany({ where: { organizationId } });
  return rows.map(toEmailRecord);
}

export async function getEmailsByStatus(
  organizationId: string,
  status: AppEmailRecordStatus,
): Promise<EmailRecord[]> {
  const rows = await prisma.emailRecord.findMany({
    where: { organizationId, status: RECORD_STATUS_TO_DB[status] },
  });
  return rows.map(toEmailRecord);
}

/** Excludes rejected/failed — the candidate pool
 * services/email/email-import-service.ts's duplicate-detection logic
 * scans, mirroring lib/email/registry.ts::findDuplicateEmail's own
 * `.filter((r) => r.status !== "rejected" && r.status !== "failed")`. */
export async function getActiveEmails(organizationId: string): Promise<EmailRecord[]> {
  const rows = await prisma.emailRecord.findMany({
    where: { organizationId, status: { notIn: ["REJECTED", "FAILED"] } },
  });
  return rows.map(toEmailRecord);
}

export async function clearEmailRegistry(organizationId: string): Promise<void> {
  await prisma.emailRecord.deleteMany({ where: { organizationId } });
}
