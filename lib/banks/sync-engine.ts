/**
 * Bank Sync Engine — the framework's public composing entry point,
 * mirroring how lib/feed/engine.ts composes its own registry/generator/
 * prioritizer modules. Orchestrates Full/Incremental/Manual/Scheduled
 * sync, duplicate + conflict detection, Sync History, and retrying a
 * failed sync. Knows nothing about any specific bank — it only ever
 * talks to the BankConnector interface, registry.ts, health.ts, and
 * mapper.ts.
 *
 * After a successful sync, transactions are published into the existing
 * Ingestion Pipeline exactly like every other source (CSVSource, the
 * Android SMS plugin): ingestTransaction() for Merchant Extraction/AI
 * Memory/Classification, then addTransactions() for storage, then the
 * existing "transaction-imported" Workflow Engine trigger — this engine
 * never bypasses any of them.
 */
import { ingestTransaction } from "@/lib/ingestion/pipeline";
import { addTransactions } from "@/lib/storage";
import { runWorkflowsForTrigger } from "@/lib/workflows/engine";
import { isProviderSyncEnabled } from "@/lib/flags";
import { registerFeedContributor } from "@/lib/feed/engine";
import { registerIndexContributor } from "@/lib/index";
import { registerCoachAccountSummaryContributor, type BankCoachAccountSummary } from "@/lib/coach/contributors";
import { deriveHealthFromSyncRun } from "@/lib/banks/health";
import { computeTransactionFingerprint, toIngestInput } from "@/lib/banks/mapper";
import {
  getAllAccounts,
  getAllConnectorRecords,
  getConnector,
  isConnectorEnabled,
  recordConnectorConnection,
  recordConnectorHealth,
  recordConnectorLastSync,
  upsertAccounts,
} from "@/lib/banks/registry";
import type { BankAccount, RawBankTransaction, SyncError, SyncRun, SyncType } from "@/lib/banks/types";
import type { FeedItem } from "@/types/feed";
import type { IndexedObject } from "@/types/index";
import type { Transaction } from "@/types/transaction";

const HISTORY_KEY = "ledgerai:banks:sync-history";
const FINGERPRINTS_KEY = "ledgerai:banks:fingerprints";
const LINKS_KEY = "ledgerai:banks:transaction-links";
const MAX_LINKS = 2000;
const MAX_HISTORY_PER_CONNECTOR = 50;

type FingerprintMap = Record<string, Record<string, string>>; // connectorId -> externalId -> fingerprint

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

function readHistory(): SyncRun[] {
  const parsed = readJSON<unknown>(HISTORY_KEY, []);
  return Array.isArray(parsed) ? (parsed as SyncRun[]) : [];
}
function writeHistory(runs: SyncRun[]): void {
  writeJSON(HISTORY_KEY, runs);
}

function readFingerprints(): FingerprintMap {
  return readJSON(FINGERPRINTS_KEY, {});
}
function writeFingerprints(map: FingerprintMap): void {
  writeJSON(FINGERPRINTS_KEY, map);
}

interface TransactionLink {
  transactionId: string;
  accountId: string;
  connectorId: string;
}

function readLinks(): TransactionLink[] {
  const parsed = readJSON<unknown>(LINKS_KEY, []);
  return Array.isArray(parsed) ? (parsed as TransactionLink[]) : [];
}
function appendTransactionLinks(links: TransactionLink[]): void {
  if (links.length === 0) return;
  writeJSON(LINKS_KEY, [...readLinks(), ...links].slice(-MAX_LINKS));
}

/** Core Transaction records have no source-tagging field of their own —
 * this is how AccountCard.tsx finds "recent transactions" for a specific
 * bank account without lib/storage.ts's Transaction schema needing to
 * know anything about banks. Returns ids only; joining against actual
 * Transaction data is the caller's job (see AccountCard.tsx). */
export function getTransactionIdsForAccount(accountId: string): string[] {
  return readLinks()
    .filter((link) => link.accountId === accountId)
    .map((link) => link.transactionId);
}

export function getSyncHistory(connectorId?: string): SyncRun[] {
  const all = readHistory();
  return connectorId ? all.filter((r) => r.connectorId === connectorId) : all;
}

export function getLatestSyncRun(connectorId: string): SyncRun | undefined {
  const runs = getSyncHistory(connectorId);
  return runs.length > 0 ? runs[runs.length - 1] : undefined;
}

/** Appends one run and caps history per connector, mirroring
 * lib/import/history.ts's MAX_ENTRIES cap. */
function persistRun(run: SyncRun): void {
  const all = readHistory();
  const forConnector = all.filter((r) => r.connectorId === run.connectorId && r.id !== run.id);
  const others = all.filter((r) => r.connectorId !== run.connectorId);
  const updatedForConnector = [...forConnector, run].slice(-MAX_HISTORY_PER_CONNECTOR);
  writeHistory([...others, ...updatedForConnector]);
}

/** Replaces an in-flight ("running") run's record with its final state —
 * same record id, so history shows one entry per sync attempt rather than
 * a "running" ghost alongside its own completion. */
function updateRun(run: SyncRun): void {
  const all = readHistory();
  const index = all.findIndex((r) => r.id === run.id);
  if (index === -1) {
    persistRun(run);
    return;
  }
  all[index] = run;
  writeHistory(all);
}

function accountFor(accounts: BankAccount[], accountId: string): BankAccount | undefined {
  return accounts.find((a) => a.id === accountId);
}

interface PendingIngest {
  raw: RawBankTransaction;
  account: BankAccount | undefined;
}

/**
 * Runs one sync of `syncType` for `connectorId`. Never bypasses the
 * Ingestion Pipeline, the Workflow Engine's "transaction-imported"
 * trigger, or Sync History — every attempt is recorded, successful or not.
 *
 * Duplicate vs. conflict: a transaction's `externalId` is the bank's own
 * stable identifier — the strongest dedup signal available. If we've seen
 * that id before with an identical fingerprint (mapper.ts's
 * computeTransactionFingerprint), it's a pure duplicate and is ignored.
 * If we've seen the id before but its fingerprint changed (e.g. a pending
 * charge posting with a corrected amount), that's a conflict: this engine
 * resolves it deterministically by treating the bank's latest data as
 * authoritative for future comparisons and counting it as an update —
 * without rewriting the transaction already in the ledger, since
 * lib/storage.ts has no update-by-external-id primitive and adding one
 * is a core-storage change outside this milestone's scope.
 */
export async function runSync(connectorId: string, syncType: SyncType): Promise<SyncRun> {
  if (!isProviderSyncEnabled()) {
    throw new Error("Provider sync is temporarily disabled.");
  }
  if (!isConnectorEnabled(connectorId)) {
    throw new Error(`Connector "${connectorId}" is disabled. Enable it before syncing.`);
  }
  const connector = getConnector(connectorId);
  if (!connector) {
    throw new Error(`Connector "${connectorId}" is not installed.`);
  }

  const startedAt = new Date();
  let run: SyncRun = {
    id: crypto.randomUUID(),
    connectorId,
    syncType,
    status: "running",
    startedAt: startedAt.toISOString(),
    completedAt: null,
    durationMs: null,
    transactionsImported: 0,
    transactionsUpdated: 0,
    duplicatesIgnored: 0,
    errors: [],
    warnings: [],
    connectorVersion: connector.version,
  };
  persistRun(run);
  recordConnectorHealth(connectorId, deriveHealthFromSyncRun(run));

  const errors: SyncError[] = [];
  const warnings: string[] = [];
  let transactionsImported = 0;
  let transactionsUpdated = 0;
  let duplicatesIgnored = 0;

  try {
    const result = await connector.sync(syncType);
    upsertAccounts(connectorId, result.accounts);
    recordConnectorConnection(connectorId, "connected");

    const fingerprints = readFingerprints();
    const known = fingerprints[connectorId] ?? {};
    const toIngest: PendingIngest[] = [];

    for (const raw of result.transactions) {
      const fingerprint = computeTransactionFingerprint(raw);
      const previous = known[raw.externalId];

      if (previous === undefined) {
        toIngest.push({ raw, account: accountFor(result.accounts, raw.accountId) });
        known[raw.externalId] = fingerprint;
      } else if (previous === fingerprint) {
        duplicatesIgnored += 1;
      } else {
        transactionsUpdated += 1;
        known[raw.externalId] = fingerprint;
        warnings.push(
          `Transaction ${raw.externalId} changed since the last sync (conflict resolved — bank data kept as authoritative).`,
        );
      }
    }

    const imported: Transaction[] = [];
    const newLinks: TransactionLink[] = [];
    for (const { raw, account } of toIngest) {
      try {
        const transaction = ingestTransaction(toIngestInput(raw, account));
        imported.push(transaction);
        newLinks.push({ transactionId: transaction.id, accountId: raw.accountId, connectorId });
        transactionsImported += 1;
      } catch (error) {
        errors.push({
          message: error instanceof Error ? error.message : "Unknown transaction mapping error.",
          accountId: raw.accountId,
        });
      }
    }

    if (imported.length > 0) {
      addTransactions(imported);
      fingerprints[connectorId] = known;
      writeFingerprints(fingerprints);
      appendTransactionLinks(newLinks);

      const now = new Date();
      for (const transaction of imported) {
        await runWorkflowsForTrigger("transaction-imported", { transaction, transactions: [transaction] }, now);
      }
    }

    const completedAt = new Date();
    const status =
      errors.length === 0
        ? "completed"
        : transactionsImported > 0 || transactionsUpdated > 0
          ? "partial"
          : "failed";

    run = {
      ...run,
      status,
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      transactionsImported,
      transactionsUpdated,
      duplicatesIgnored,
      errors,
      warnings,
    };
  } catch (error) {
    const completedAt = new Date();
    run = {
      ...run,
      status: "failed",
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      errors: [{ message: error instanceof Error ? error.message : "Unknown sync error." }],
    };
  }

  updateRun(run);
  if (run.status === "completed" || run.status === "partial") {
    recordConnectorLastSync(connectorId, run.completedAt!);
  }
  recordConnectorHealth(connectorId, deriveHealthFromSyncRun(run));
  return run;
}

/** Re-runs the same syncType as the connector's most recent failed or
 * partial run. Returns undefined (rather than throwing) when there's
 * nothing to retry — "no failed sync" isn't itself an error. */
export async function retryFailedSync(connectorId: string): Promise<SyncRun | undefined> {
  const latest = getLatestSyncRun(connectorId);
  if (!latest || (latest.status !== "failed" && latest.status !== "partial")) return undefined;
  return runSync(connectorId, latest.syncType);
}

// --- Feed / Search / Coach contributions -----------------------------------

function feedItemForConnector(connectorId: string, institution: string): FeedItem | null {
  const history = getSyncHistory(connectorId);
  const latest = history[history.length - 1];
  if (!latest || latest.status === "running") return null;

  const now = new Date().toISOString();
  const isFirstRun = history.length === 1;

  let title: string;
  let summary: string;
  let severity: FeedItem["severity"] = "info";

  if (latest.status === "failed") {
    title = "Synchronization failed";
    summary = `${institution} failed to synchronize${latest.errors[0] ? `: ${latest.errors[0].message}` : "."}`;
    severity = "warning";
  } else if (isFirstRun) {
    title = "New account connected";
    summary = `${institution} was connected and synced for the first time (${latest.transactionsImported} transaction(s) imported).`;
  } else if (latest.syncType === "manual") {
    title = "Manual sync completed";
    summary = `${institution}: manual sync imported ${latest.transactionsImported} transaction(s), updated ${latest.transactionsUpdated}, ignored ${latest.duplicatesIgnored} duplicate(s).`;
  } else {
    title = "Bank synchronization completed";
    summary = `${institution} synced successfully: ${latest.transactionsImported} imported, ${latest.transactionsUpdated} updated, ${latest.duplicatesIgnored} duplicate(s) ignored.`;
  }

  return {
    id: `bank:${connectorId}:${latest.id}`,
    type: "system-insight",
    title,
    summary,
    priority: 0, // recomputed by lib/feed/prioritizer.ts from type/severity/confidence
    severity,
    sourceEngine: "feed",
    relatedObjectIds: [],
    explanationId: null,
    confidence: 1,
    createdAt: now,
    expiresAt: null,
    isRead: false,
    isPinned: false,
    isDismissed: false,
    metadata: { connectorId, syncRunId: latest.id, institution },
  };
}

function buildBankFeedItems(): FeedItem[] {
  return getAllConnectorRecords()
    .map((record) => feedItemForConnector(record.id, record.institution))
    .filter((item): item is FeedItem => item !== null);
}

function buildBankIndexObjects(): IndexedObject[] {
  const now = new Date().toISOString();
  const objects: IndexedObject[] = [];

  for (const account of getAllAccounts()) {
    objects.push({
      id: `bank-account:${account.id}`,
      type: "bank-account",
      title: `${account.institution} — ${account.accountName}`,
      description: `${account.accountType} account ${account.maskedNumber}, balance ${account.balance} ${account.currency}.`,
      keywords: [account.institution, account.accountName, account.accountType, account.maskedNumber],
      merchant: account.institution,
      amount: account.balance,
      date: account.lastSynced?.slice(0, 10),
      tags: ["bank", account.accountType],
      metadata: { accountId: account.id, institution: account.institution, accountType: account.accountType },
      createdAt: now,
      updatedAt: now,
      searchableText: `${account.institution} ${account.accountName} ${account.accountType} ${account.maskedNumber}`.toLowerCase(),
    });
  }

  const connectors = getAllConnectorRecords();
  for (const record of connectors) {
    objects.push({
      id: `bank-institution:${record.id}`,
      type: "bank-institution",
      title: record.institution,
      description: record.metadata.description,
      keywords: [record.institution, record.name, record.country],
      tags: ["bank", "institution", ...record.supportedFeatures],
      metadata: { connectorId: record.id, country: record.country, supportedFeatures: record.supportedFeatures },
      createdAt: now,
      updatedAt: now,
      searchableText: `${record.institution} ${record.name} ${record.country}`.toLowerCase(),
    });

    for (const run of getSyncHistory(record.id)) {
      objects.push({
        id: `bank-sync-run:${run.id}`,
        type: "bank-sync-run",
        title: `${record.institution} — ${run.syncType} sync (${run.status})`,
        description: `Imported ${run.transactionsImported}, updated ${run.transactionsUpdated}, ignored ${run.duplicatesIgnored} duplicate(s).`,
        keywords: [record.institution, run.syncType, run.status],
        date: run.startedAt.slice(0, 10),
        tags: ["bank", "sync", run.syncType, run.status],
        metadata: { connectorId: record.id, syncRunId: run.id, status: run.status },
        createdAt: now,
        updatedAt: now,
        searchableText: `${record.institution} ${run.syncType} ${run.status} sync`.toLowerCase(),
      });
    }
  }

  return objects;
}

const STALE_THRESHOLD_DAYS = 2;

function buildBankCoachSummary(): BankCoachAccountSummary | null {
  const accounts = getAllAccounts().filter((a) => a.status !== "closed");
  if (accounts.length === 0) return null;

  const now = Date.now();
  const staleAccounts = accounts
    .filter((a) => !a.lastSynced || (now - new Date(a.lastSynced).getTime()) / 86_400_000 >= STALE_THRESHOLD_DAYS)
    .map((a) => ({
      accountName: a.accountName,
      institution: a.institution,
      daysSinceSync: a.lastSynced ? Math.floor((now - new Date(a.lastSynced).getTime()) / 86_400_000) : Infinity,
    }));

  return {
    connectedAccountCount: accounts.length,
    combinedBalance: accounts.reduce((sum, a) => sum + a.balance, 0),
    currency: accounts[0].currency,
    staleAccounts,
  };
}

registerFeedContributor(buildBankFeedItems);
registerIndexContributor(buildBankIndexObjects);
registerCoachAccountSummaryContributor(buildBankCoachSummary);
