/**
 * Email Registry — holds every registered EmailProvider's live instance
 * plus its persisted enabled/health/connection/lastSync state, every
 * processed EmailRecord, and import run history. Deliberately independent
 * of React, and of any specific provider implementation — it only knows
 * the EmailProvider shape (provider.ts) and this framework's own types
 * (types.ts). Mirrors lib/banks/registry.ts's split exactly.
 */
import type { EmailProvider } from "@/lib/email/provider";
import type {
  EmailConnectionStatus,
  EmailImportRun,
  EmailProviderHealth,
  EmailProviderRecord,
  EmailRecord,
  EmailRecordStatus,
  EmailStatistics,
  EmailType,
  ExtractedEmailFields,
} from "@/lib/email/types";

const STATE_KEY = "ledgerai:email:providers";
const RECORDS_KEY = "ledgerai:email:records";
const RUNS_KEY = "ledgerai:email:import-runs";
const MAX_RUNS_PER_PROVIDER = 50;

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || typeof parsed !== "object" ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

// --- provider instances + persisted provider state --------------------------

interface PersistedProviderState {
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
  lastHealth?: EmailProviderHealth;
  lastConnection?: EmailConnectionStatus;
  lastSync?: string | null;
}
type PersistedProviderStateMap = Record<string, PersistedProviderState>;

function readProviderState(): PersistedProviderStateMap {
  return readJSON(STATE_KEY, {});
}
function writeProviderState(state: PersistedProviderStateMap): void {
  writeJSON(STATE_KEY, state);
}

const instances = new Map<string, EmailProvider>();

export function registerEmailProvider(provider: EmailProvider): void {
  if (instances.has(provider.id)) {
    throw new Error(`Email provider "${provider.id}" is already registered.`);
  }
  instances.set(provider.id, provider);

  const state = readProviderState();
  if (!state[provider.id]) {
    const now = new Date().toISOString();
    state[provider.id] = { enabled: true, installedAt: now, updatedAt: now };
    writeProviderState(state);
  }
}

export function unregisterEmailProvider(id: string): void {
  instances.delete(id);
}

export function getEmailProvider(id: string): EmailProvider | undefined {
  return instances.get(id);
}

export function getAllEmailProviders(): EmailProvider[] {
  return Array.from(instances.values());
}

export function isEmailProviderEnabled(id: string): boolean {
  return readProviderState()[id]?.enabled ?? false;
}

export function getEnabledEmailProviders(): EmailProvider[] {
  return getAllEmailProviders().filter((p) => isEmailProviderEnabled(p.id));
}

export function setEmailProviderEnabled(id: string, enabled: boolean): void {
  if (!instances.has(id)) throw new Error(`Cannot toggle unknown email provider "${id}".`);
  const state = readProviderState();
  const now = new Date().toISOString();
  const existing = state[id] ?? { enabled, installedAt: now, updatedAt: now };
  state[id] = { ...existing, enabled, updatedAt: now };
  writeProviderState(state);
}

export function recordProviderHealth(id: string, health: EmailProviderHealth): void {
  const state = readProviderState();
  const now = new Date().toISOString();
  const existing = state[id] ?? { enabled: true, installedAt: now, updatedAt: now };
  state[id] = { ...existing, lastHealth: health, updatedAt: now };
  writeProviderState(state);
}

export function recordProviderConnection(id: string, connection: EmailConnectionStatus): void {
  const state = readProviderState();
  const now = new Date().toISOString();
  const existing = state[id] ?? { enabled: true, installedAt: now, updatedAt: now };
  state[id] = { ...existing, lastConnection: connection, updatedAt: now };
  writeProviderState(state);
}

export function recordProviderLastSync(id: string, lastSyncIso: string): void {
  const state = readProviderState();
  const now = new Date().toISOString();
  const existing = state[id] ?? { enabled: true, installedAt: now, updatedAt: now };
  state[id] = { ...existing, lastSync: lastSyncIso, updatedAt: now };
  writeProviderState(state);
}

export function getAllEmailProviderRecords(): EmailProviderRecord[] {
  const state = readProviderState();
  const now = new Date().toISOString();
  return getAllEmailProviders().map((provider) => {
    const persisted = state[provider.id];
    return {
      id: provider.id,
      name: provider.name,
      version: provider.version,
      enabled: persisted?.enabled ?? false,
      connection: persisted?.lastConnection ?? "disconnected",
      health: persisted?.lastHealth ?? { status: "disconnected", message: "Not yet checked.", checkedAt: now },
      lastSync: persisted?.lastSync ?? null,
      metadata: provider.metadata(),
      installedAt: persisted?.installedAt ?? now,
      updatedAt: persisted?.updatedAt ?? now,
    };
  });
}

export function getEmailProviderRecord(id: string): EmailProviderRecord | undefined {
  return getAllEmailProviderRecords().find((r) => r.id === id);
}

export function clearProviderState(): void {
  writeProviderState({});
}

// --- email records ------------------------------------------------------------

function readRecords(): EmailRecord[] {
  const parsed = readJSON<unknown>(RECORDS_KEY, []);
  return Array.isArray(parsed) ? (parsed as EmailRecord[]) : [];
}
function writeRecords(records: EmailRecord[]): void {
  writeJSON(RECORDS_KEY, records);
}

export function recordEmail(record: EmailRecord): void {
  const all = readRecords();
  const index = all.findIndex((r) => r.id === record.id);
  if (index === -1) {
    writeRecords([...all, record]);
  } else {
    all[index] = record;
    writeRecords(all);
  }
}

export function updateEmail(id: string, patch: Partial<EmailRecord>): EmailRecord | undefined {
  const all = readRecords();
  const index = all.findIndex((r) => r.id === id);
  if (index === -1) return undefined;
  all[index] = { ...all[index], ...patch };
  writeRecords(all);
  return all[index];
}

export function getEmail(id: string): EmailRecord | undefined {
  return readRecords().find((r) => r.id === id);
}

export function getAllEmails(): EmailRecord[] {
  return readRecords();
}

export function getEmailsByStatus(status: EmailRecordStatus): EmailRecord[] {
  return readRecords().filter((r) => r.status === status);
}

export function clearEmailRegistry(): void {
  writeRecords([]);
}

/** Groups of email types Duplicate Detection treats alike — matching the
 * spec's four named duplicate scenarios exactly: a repeated fetch of the
 * same message (externalId, checked first, regardless of type), a
 * duplicate invoice (number + amount), a duplicate receipt-like email
 * (merchant + amount within a time window), and a repeated statement
 * (period + sender). Anything outside these groups (including "unknown")
 * is never flagged — there's no reliable identity to key it on yet. */
const INVOICE_LIKE: EmailType[] = ["invoice", "tax-document"];
const RECEIPT_LIKE: EmailType[] = ["receipt", "refund", "subscription-renewal", "flight-booking", "hotel-booking", "insurance"];
const STATEMENT_LIKE: EmailType[] = ["bank-statement", "credit-card-statement", "investment-report", "loan"];
const RECEIPT_DUPLICATE_TOLERANCE_MS = 60 * 60_000; // 60 minutes

export function findDuplicateEmail(
  raw: { externalId: string; providerId: string; sender: string; receivedAt: string },
  type: EmailType,
  fields: ExtractedEmailFields,
): EmailRecord | undefined {
  const all = readRecords().filter((r) => r.status !== "rejected" && r.status !== "failed");

  const byExternalId = all.find((r) => r.providerId === raw.providerId && r.externalId === raw.externalId);
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

// --- import run history -------------------------------------------------------

function readRuns(): EmailImportRun[] {
  const parsed = readJSON<unknown>(RUNS_KEY, []);
  return Array.isArray(parsed) ? (parsed as EmailImportRun[]) : [];
}
function writeRuns(runs: EmailImportRun[]): void {
  writeJSON(RUNS_KEY, runs);
}

/** Appends one run and caps history per provider, mirroring
 * lib/banks/sync-engine.ts's persistRun(). */
export function persistImportRun(run: EmailImportRun): void {
  const all = readRuns();
  const forProvider = all.filter((r) => r.providerId === run.providerId && r.id !== run.id);
  const others = all.filter((r) => r.providerId !== run.providerId);
  const updatedForProvider = [...forProvider, run].slice(-MAX_RUNS_PER_PROVIDER);
  writeRuns([...others, ...updatedForProvider]);
}

export function updateImportRun(run: EmailImportRun): void {
  const all = readRuns();
  const index = all.findIndex((r) => r.id === run.id);
  if (index === -1) {
    persistImportRun(run);
    return;
  }
  all[index] = run;
  writeRuns(all);
}

export function getImportHistory(providerId?: string): EmailImportRun[] {
  const all = readRuns();
  return providerId ? all.filter((r) => r.providerId === providerId) : all;
}

export function getLatestImportRun(providerId: string): EmailImportRun | undefined {
  const runs = getImportHistory(providerId);
  return runs.length > 0 ? runs[runs.length - 1] : undefined;
}

export function clearImportRuns(): void {
  writeRuns([]);
}

// --- statistics -----------------------------------------------------------------

export function computeEmailStatistics(): EmailStatistics {
  const all = readRecords();
  return {
    emailsImported: all.filter((r) => r.status === "imported").length,
    financialEmailsClassified: all.filter((r) => r.emailType !== "unknown").length,
    duplicatesDetected: all.filter((r) => r.isDuplicate && r.status !== "imported").length,
    transactionsCreated: all.reduce((sum, r) => sum + r.linkedTransactionIds.length, 0),
    transactionsMatched: all.reduce((sum, r) => sum + r.matchedExistingTransactionIds.length, 0),
    attachmentsProcessed: all.reduce((sum, r) => sum + r.fields.attachments.filter((a) => a.documentId !== null).length, 0),
    importErrors: all.filter((r) => r.status === "failed").length,
    unknownEmailsCount: all.filter((r) => r.emailType === "unknown").length,
  };
}
