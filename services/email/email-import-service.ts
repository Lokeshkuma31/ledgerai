/**
 * Email Import Service — combines lib/email/registry.ts's in-memory live
 * provider instances (unchanged) with repositories/email-repository.ts's
 * Postgres-backed persisted state/records, the same split established for
 * Connection Hub and Bank Sync. Import-run history is translated onto
 * repositories/sync-job-repository.ts (category EMAIL_IMPORT) rather than
 * a dedicated table — see that repository's own module comment.
 */
import { getAllEmailProviders, getEmailProvider } from "@/lib/email/registry";
import type {
  EmailImportError,
  EmailImportRun,
  EmailProviderHealth,
  EmailProviderRecord,
  EmailRecord,
  EmailRecordStatus,
  EmailStatistics,
  EmailSyncType,
  EmailType,
  ExtractedEmailFields,
} from "@/lib/email/types";
import type { SyncJob, SyncJobType } from "@/lib/sync/types";
import * as emailRepository from "@/repositories/email-repository";
import * as syncJobRepository from "@/repositories/sync-job-repository";

// --- provider state (mirrors services/banks/bank-sync-service.ts) ---------

export async function registerProviderState(
  organizationId: string,
  providerId: string,
): Promise<void> {
  await emailRepository.ensureProviderRegistered(organizationId, providerId);
}

export async function isEmailProviderEnabled(
  organizationId: string,
  id: string,
): Promise<boolean> {
  const state = await emailRepository.getProviderState(organizationId, id);
  return state?.enabled ?? false;
}

export async function getEnabledEmailProviders(organizationId: string) {
  const states = await emailRepository.getAllProviderStates(organizationId);
  return getAllEmailProviders().filter((provider) => states[provider.id]?.enabled);
}

export async function setEmailProviderEnabled(
  organizationId: string,
  id: string,
  enabled: boolean,
): Promise<void> {
  if (!getEmailProvider(id)) throw new Error(`Cannot toggle unknown email provider "${id}".`);
  await emailRepository.setProviderEnabled(organizationId, id, enabled);
}

export async function recordProviderHealth(
  organizationId: string,
  id: string,
  health: EmailProviderHealth,
): Promise<void> {
  await emailRepository.recordProviderHealth(organizationId, id, health);
}

export async function recordProviderConnection(
  organizationId: string,
  id: string,
  connection: EmailProviderRecord["connection"],
): Promise<void> {
  await emailRepository.recordProviderConnection(organizationId, id, connection);
}

export async function recordProviderLastSync(
  organizationId: string,
  id: string,
  lastSyncIso: string,
): Promise<void> {
  await emailRepository.recordProviderLastSync(organizationId, id, lastSyncIso);
}

/** Mirrors lib/email/registry.ts::getAllEmailProviderRecords exactly, now
 * organization-scoped. */
export async function getAllEmailProviderRecords(
  organizationId: string,
): Promise<EmailProviderRecord[]> {
  const states = await emailRepository.getAllProviderStates(organizationId);
  const now = new Date().toISOString();
  return getAllEmailProviders().map((provider) => {
    const persisted = states[provider.id];
    return {
      id: provider.id,
      name: provider.name,
      version: provider.version,
      enabled: persisted?.enabled ?? false,
      connection: persisted?.lastConnection ?? "disconnected",
      health: persisted?.lastHealth ?? {
        status: "disconnected",
        message: "Not yet checked.",
        checkedAt: now,
      },
      lastSync: persisted?.lastSync ?? null,
      metadata: provider.metadata(),
      installedAt: persisted?.installedAt ?? now,
      updatedAt: persisted?.updatedAt ?? now,
    };
  });
}

export async function getEmailProviderRecord(
  organizationId: string,
  id: string,
): Promise<EmailProviderRecord | undefined> {
  const records = await getAllEmailProviderRecords(organizationId);
  return records.find((r) => r.id === id);
}

export async function clearProviderState(organizationId: string): Promise<void> {
  return emailRepository.clearProviderState(organizationId);
}

// --- email records ------------------------------------------------------------

export async function recordEmail(
  organizationId: string,
  record: EmailRecord,
): Promise<EmailRecord> {
  return emailRepository.recordEmail(organizationId, record);
}

export async function updateEmail(
  organizationId: string,
  id: string,
  patch: Partial<EmailRecord>,
): Promise<EmailRecord | undefined> {
  return emailRepository.updateEmail(organizationId, id, patch);
}

export async function getEmail(
  organizationId: string,
  id: string,
): Promise<EmailRecord | undefined> {
  return emailRepository.getEmail(organizationId, id);
}

export async function getAllEmails(organizationId: string): Promise<EmailRecord[]> {
  return emailRepository.getAllEmails(organizationId);
}

export async function getEmailsByStatus(
  organizationId: string,
  status: EmailRecordStatus,
): Promise<EmailRecord[]> {
  return emailRepository.getEmailsByStatus(organizationId, status);
}

export async function clearEmailRegistry(organizationId: string): Promise<void> {
  return emailRepository.clearEmailRegistry(organizationId);
}

const INVOICE_LIKE: EmailType[] = ["invoice", "tax-document"];
const RECEIPT_LIKE: EmailType[] = [
  "receipt",
  "refund",
  "subscription-renewal",
  "flight-booking",
  "hotel-booking",
  "insurance",
];
const STATEMENT_LIKE: EmailType[] = [
  "bank-statement",
  "credit-card-statement",
  "investment-report",
  "loan",
];
const RECEIPT_DUPLICATE_TOLERANCE_MS = 60 * 60_000; // 60 minutes

/**
 * Duplicate detection, mirroring lib/email/registry.ts::findDuplicateEmail
 * exactly — the four named duplicate scenarios (repeated externalId
 * fetch, duplicate invoice, duplicate receipt-like email within a time
 * window, repeated statement), checked in the same order against the same
 * "not rejected/failed" candidate pool, now fetched from Postgres instead
 * of localStorage.
 */
export async function findDuplicateEmail(
  organizationId: string,
  raw: { externalId: string; providerId: string; sender: string; receivedAt: string },
  type: EmailType,
  fields: ExtractedEmailFields,
): Promise<EmailRecord | undefined> {
  const all = await emailRepository.getActiveEmails(organizationId);

  const byExternalId = all.find(
    (r) => r.providerId === raw.providerId && r.externalId === raw.externalId,
  );
  if (byExternalId) return byExternalId;

  if (INVOICE_LIKE.includes(type) && fields.invoiceNumber && fields.amount !== undefined) {
    return all.find(
      (r) =>
        INVOICE_LIKE.includes(r.emailType) &&
        r.fields.invoiceNumber?.toLowerCase() === fields.invoiceNumber!.toLowerCase() &&
        r.fields.amount !== undefined &&
        Math.abs(r.fields.amount - fields.amount!) < 0.01,
    );
  }

  if (RECEIPT_LIKE.includes(type) && fields.merchant && fields.amount !== undefined) {
    return all.find((r) => {
      if (!RECEIPT_LIKE.includes(r.emailType)) return false;
      if (r.fields.merchant?.toLowerCase() !== fields.merchant!.toLowerCase()) return false;
      if (r.fields.amount === undefined || Math.abs(r.fields.amount - fields.amount!) >= 0.01) return false;
      const diffMs = Math.abs(new Date(r.receivedAt).getTime() - new Date(raw.receivedAt).getTime());
      return diffMs <= RECEIPT_DUPLICATE_TOLERANCE_MS;
    });
  }

  if (STATEMENT_LIKE.includes(type) && fields.statementPeriod) {
    return all.find(
      (r) =>
        STATEMENT_LIKE.includes(r.emailType) &&
        r.sender === raw.sender &&
        r.fields.statementPeriod?.start === fields.statementPeriod!.start &&
        r.fields.statementPeriod?.end === fields.statementPeriod!.end,
    );
  }

  return undefined;
}

export async function computeEmailStatistics(organizationId: string): Promise<EmailStatistics> {
  const all = await emailRepository.getAllEmails(organizationId);
  return {
    emailsImported: all.filter((r) => r.status === "imported").length,
    financialEmailsClassified: all.filter((r) => r.emailType !== "unknown").length,
    duplicatesDetected: all.filter((r) => r.isDuplicate && r.status !== "imported").length,
    transactionsCreated: all.reduce((sum, r) => sum + r.linkedTransactionIds.length, 0),
    transactionsMatched: all.reduce((sum, r) => sum + r.matchedExistingTransactionIds.length, 0),
    attachmentsProcessed: all.reduce(
      (sum, r) => sum + r.fields.attachments.filter((a) => a.documentId !== null).length,
      0,
    ),
    importErrors: all.filter((r) => r.status === "failed").length,
    unknownEmailsCount: all.filter((r) => r.emailType === "unknown").length,
  };
}

// --- import run history (translated onto SyncJob) --------------------------

const SYNC_TYPE_TO_RUN_TYPE: Record<EmailSyncType, SyncJobType> = {
  full: "initial",
  incremental: "incremental",
  manual: "manual",
  scheduled: "scheduled",
};
const RUN_TYPE_TO_SYNC_TYPE: Record<SyncJobType, EmailSyncType> = {
  initial: "full",
  incremental: "incremental",
  manual: "manual",
  scheduled: "scheduled",
  resume: "incremental",
  retry: "incremental",
};

function toSyncJob(run: EmailImportRun, plugin: string): SyncJob {
  return {
    id: run.id,
    provider: run.providerId,
    plugin,
    type: SYNC_TYPE_TO_RUN_TYPE[run.syncType],
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    duration: run.durationMs,
    itemsDiscovered: run.emailsFetched,
    itemsImported: run.transactionsCreated,
    itemsSkipped: run.emailsFetched - run.financialEmailsClassified,
    duplicates: run.duplicatesDetected,
    errors: run.errors.map((e) => ({ message: e.message, at: run.completedAt ?? run.startedAt })),
    warnings: [],
    retryCount: 0,
    lastCheckpoint: null,
    metadata: {
      financialEmailsClassified: run.financialEmailsClassified,
      transactionsMatched: run.transactionsMatched,
      emailImportErrors: run.errors,
    },
    queuedAt: run.startedAt,
  };
}

function fromSyncJob(job: SyncJob): EmailImportRun {
  const metadata = job.metadata as {
    financialEmailsClassified?: number;
    transactionsMatched?: number;
    emailImportErrors?: EmailImportError[];
  };
  // EmailImportRun's status is a strict subset of SyncJobStatus (never
  // queued/paused/cancelled in practice — lib/email/engine.ts only ever
  // writes running/completed/failed/partial) — fall back defensively.
  const status: EmailImportRun["status"] =
    job.status === "running" || job.status === "completed" || job.status === "failed" || job.status === "partial"
      ? job.status
      : "failed";
  return {
    id: job.id,
    providerId: job.provider,
    syncType: RUN_TYPE_TO_SYNC_TYPE[job.type],
    status,
    startedAt: job.startedAt ?? job.queuedAt,
    completedAt: job.completedAt,
    durationMs: job.duration,
    emailsFetched: job.itemsDiscovered,
    financialEmailsClassified: metadata.financialEmailsClassified ?? job.itemsDiscovered - job.itemsSkipped,
    duplicatesDetected: job.duplicates,
    transactionsCreated: job.itemsImported,
    transactionsMatched: metadata.transactionsMatched ?? 0,
    errors: metadata.emailImportErrors ?? job.errors.map((e) => ({ message: e.message })),
  };
}

/** Appends/transitions one run, mirroring lib/email/registry.ts::
 * persistImportRun + updateImportRun (both are the same upsert-by-id
 * operation lib/email/engine.ts::runEmailSync already relies on: create
 * "running", then transition to its final state). */
export async function persistImportRun(
  organizationId: string,
  run: EmailImportRun,
): Promise<void> {
  const plugin = getEmailProvider(run.providerId)?.name ?? run.providerId;
  await syncJobRepository.recordSyncJob(organizationId, toSyncJob(run, plugin), "email");
}

export const updateImportRun = persistImportRun;

export async function getImportHistory(
  organizationId: string,
  providerId?: string,
): Promise<EmailImportRun[]> {
  const jobs = providerId
    ? await syncJobRepository.getSyncJobsByProvider(organizationId, providerId)
    : await syncJobRepository.getAllSyncJobs(organizationId);
  return jobs.map(fromSyncJob);
}

export async function getLatestImportRun(
  organizationId: string,
  providerId: string,
): Promise<EmailImportRun | undefined> {
  const job = await syncJobRepository.getLatestSyncJob(organizationId, providerId);
  return job ? fromSyncJob(job) : undefined;
}
