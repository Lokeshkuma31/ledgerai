/**
 * Android SMS & Notification Source Plugin — composes parser.ts,
 * normalizer.ts, and matcher.ts into the actual Plugin Framework
 * extension: registration/lifecycle/health, settings, statistics, and the
 * Import Preview -> Ingestion Pipeline flow. This is the only file that
 * talks to anything outside plugins/android-sms/ — parser/normalizer/
 * matcher stay pure and framework-agnostic.
 *
 * Pipeline Integration: this plugin never constructs a Transaction or
 * writes to storage on its own initiative — every imported row goes
 * through lib/ingestion/pipeline.ts's ingestTransaction (Merchant
 * Extraction -> AI Memory -> Classifier), exactly like every other source,
 * before lib/storage.ts's addTransactions persists the batch.
 */
import { ingestTransaction, type IngestInput } from "@/lib/ingestion/pipeline";
import { addTransactions } from "@/lib/storage";
import { emitHook } from "@/lib/plugins/hooks";
import { runWorkflowsForTrigger } from "@/lib/workflows/engine";
import { registerFeedContributor } from "@/lib/feed/engine";
import { registerIndexContributor } from "@/lib/index";
import {
  registerCoachImportSummaryContributor,
  type CoachImportSummaryContribution,
} from "@/lib/coach/contributors";
import { parseMessages } from "@/plugins/android-sms/parser";
import { normalizeTransaction } from "@/plugins/android-sms/normalizer";
import {
  DEFAULT_DUPLICATE_CONFIG,
  computeDuplicateSignature,
  findDuplicateIndices,
  type ImportedSignatureRecord,
} from "@/plugins/android-sms/matcher";
import { MOCK_SMS_MESSAGES } from "@/plugins/android-sms/mock-data";
import type {
  AndroidSmsPluginSettings,
  ImportSummary,
  NormalizedSmsTransaction,
  ParserStatistics,
  RawSmsMessage,
  SmsImportPreviewRow,
  SmsPaymentMethod,
} from "@/plugins/android-sms/types";
import type { Plugin, PluginCapability, PluginHealth } from "@/types/plugin";
import type { FeedItem } from "@/types/feed";
import type { IndexedObject } from "@/types/index";
import type { PaymentMethod } from "@/types/transaction";

const PLUGIN_ID = "android-sms";
const PLUGIN_NAME = "Android SMS & Notification Source";
const PLUGIN_VERSION = "1.0.0";

const SETTINGS_KEY = "ledgerai:plugins:android-sms:settings";
const IMPORTED_KEY = "ledgerai:plugins:android-sms:imported";
const STATS_KEY = "ledgerai:plugins:android-sms:stats";
const SUMMARY_KEY = "ledgerai:plugins:android-sms:summary";

// --- settings --------------------------------------------------------------

export const DEFAULT_SETTINGS: AndroidSmsPluginSettings = {
  supportedBanks: ["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra Bank"],
  supportedWallets: ["Google Pay", "PhonePe", "Paytm", "Amazon Pay", "Mobikwik"],
  duplicateToleranceMinutes: DEFAULT_DUPLICATE_CONFIG.toleranceMinutes,
  confidenceThreshold: 0.6,
  autoImport: false,
  unknownMerchantHandling: "import-as-unknown",
};

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || typeof parsed !== "object" ? fallback : { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getSettings(): AndroidSmsPluginSettings {
  return readJSON(SETTINGS_KEY, DEFAULT_SETTINGS);
}

export function updateSettings(patch: Partial<AndroidSmsPluginSettings>): AndroidSmsPluginSettings {
  const next = { ...getSettings(), ...patch };
  writeJSON(SETTINGS_KEY, next);
  return next;
}

// --- previously-imported signatures (duplicate detection persistence) -----

function readImported(): ImportedSignatureRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(IMPORTED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ImportedSignatureRecord[]) : [];
  } catch {
    return [];
  }
}

function recordImported(records: ImportedSignatureRecord[]): void {
  const updated = [...readImported(), ...records];
  writeJSON(IMPORTED_KEY, updated);
}

// --- statistics --------------------------------------------------------------

interface InternalStats extends ParserStatistics {
  /** Running sum backing averageConfidence — kept alongside the exposed
   * ParserStatistics rather than recomputed from history, since individual
   * parses aren't retained. */
  confidenceSum: number;
}

const EMPTY_STATS: InternalStats = {
  messagesParsed: 0,
  successfulParses: 0,
  failedParses: 0,
  averageConfidence: 0,
  duplicatesSkipped: 0,
  unknownMerchants: 0,
  unknownFormats: 0,
  confidenceSum: 0,
};

function readStats(): InternalStats {
  return readJSON(STATS_KEY, EMPTY_STATS);
}

function writeStats(stats: InternalStats): void {
  writeJSON(STATS_KEY, stats);
}

export function getStatistics(): ParserStatistics {
  const stats = readStats();
  return {
    messagesParsed: stats.messagesParsed,
    successfulParses: stats.successfulParses,
    failedParses: stats.failedParses,
    averageConfidence: stats.averageConfidence,
    duplicatesSkipped: stats.duplicatesSkipped,
    unknownMerchants: stats.unknownMerchants,
    unknownFormats: stats.unknownFormats,
  };
}

export function resetStatistics(): void {
  writeStats(EMPTY_STATS);
  writeJSON(IMPORTED_KEY, []);
}

// --- import summary (feed/coach contributions read this) -------------------

function readSummary(): ImportSummary {
  return readJSON(SUMMARY_KEY, {
    totalMessages: 0,
    importedCount: 0,
    duplicateCount: 0,
    skippedCount: 0,
    failedCount: 0,
    lastImportAt: null,
  });
}

function writeSummary(summary: ImportSummary): void {
  writeJSON(SUMMARY_KEY, summary);
}

// --- preview building --------------------------------------------------------

/**
 * Parses + normalizes + duplicate-checks a batch of messages — a pure,
 * read-only pass with no side effects (no storage writes, no statistics
 * update). "Failed Transaction" parses are recognized but always marked
 * Skipped: a declined/reversed payment moved no money, so it must never
 * become a ledger Transaction.
 */
export function buildPreviewRows(
  messages: RawSmsMessage[] = MOCK_SMS_MESSAGES,
  settings: AndroidSmsPluginSettings = getSettings(),
): SmsImportPreviewRow[] {
  const outcomes = parseMessages(messages);
  const previouslyImported = readImported();

  const normalizedCandidates = outcomes.map((outcome, index) => ({
    message: messages[index],
    normalized: outcome.status === "parsed" ? normalizeTransaction(outcome.transaction) : null,
  }));

  const duplicateInputs = normalizedCandidates
    .map((c, index) => (c.normalized ? { index, transaction: c.normalized, receivedAt: c.message.receivedAt } : null))
    .filter((c): c is { index: number; transaction: NormalizedSmsTransaction; receivedAt: string } => c !== null);

  const duplicateIndices = findDuplicateIndices(
    duplicateInputs.map(({ transaction, receivedAt }) => ({ transaction, receivedAt })),
    previouslyImported,
    { toleranceMinutes: settings.duplicateToleranceMinutes },
  );
  // findDuplicateIndices returns indices into duplicateInputs, not into the
  // original messages array — map back to the right row.
  const duplicateMessageIndices = new Set(
    [...duplicateIndices].map((i) => duplicateInputs[i].index),
  );

  return outcomes.map((outcome, index) => {
    const message = messages[index];

    if (outcome.status !== "parsed") {
      return {
        message,
        normalized: null,
        failure: outcome.failure,
        status: outcome.status === "malformed" ? "Malformed" : "Unknown Format",
      };
    }

    const normalized = normalizedCandidates[index].normalized!;

    if (normalized.transactionType === "failed") {
      return { message, normalized, failure: null, status: "Skipped" };
    }
    if (duplicateMessageIndices.has(index)) {
      return { message, normalized, failure: null, status: "Duplicate" };
    }
    if (
      settings.unknownMerchantHandling === "skip" &&
      !normalized.merchant &&
      (normalized.transactionType === "debit" || normalized.transactionType === "credit")
    ) {
      return { message, normalized, failure: null, status: "Skipped" };
    }
    return { message, normalized, failure: null, status: "Ready" };
  });
}

/**
 * The explicit "Scan Messages" action: builds preview rows AND records
 * parser statistics for this batch (messagesParsed/successfulParses/etc.).
 * Statistics only update from an explicit scan, not from every render, so
 * re-rendering the Import Preview doesn't silently inflate them.
 */
export function scanMessages(
  messages: RawSmsMessage[] = MOCK_SMS_MESSAGES,
): SmsImportPreviewRow[] {
  const rows = buildPreviewRows(messages);

  const stats = readStats();
  stats.messagesParsed += rows.length;
  for (const row of rows) {
    if (row.status === "Malformed") {
      stats.failedParses += 1;
    } else if (row.status === "Unknown Format") {
      stats.failedParses += 1;
      stats.unknownFormats += 1;
    } else {
      stats.successfulParses += 1;
      stats.confidenceSum += row.normalized!.confidence;
      if (!row.normalized!.merchant) stats.unknownMerchants += 1;
      if (row.status === "Duplicate") stats.duplicatesSkipped += 1;
    }
  }
  stats.averageConfidence = stats.successfulParses > 0 ? stats.confidenceSum / stats.successfulParses : 0;
  writeStats(stats);

  return rows;
}

// --- import execution --------------------------------------------------------

const PAYMENT_METHOD_MAP: Record<SmsPaymentMethod, PaymentMethod> = {
  UPI: "UPI",
  "Credit Card": "Credit Card",
  "Debit Card": "Debit Card",
  // Core PaymentMethod has no "Wallet" — most Indian wallets are funded via
  // UPI, so that's the closest existing option (mirrors
  // lib/import/mapper.ts's normalizePaymentMethod fallback approach).
  Wallet: "UPI",
  "Bank Transfer": "Net Banking",
  Cash: "Cash",
};

/**
 * Builds the note text ingestTransaction's note-based Merchant Extraction
 * (lib/merchant/engine.ts) actually understands ("at <Merchant>" /
 * "<Merchant> order|ride|trip|...") — this is how a merchant this plugin
 * already identified ends up recognized by the shared Merchant
 * Intelligence Engine too, without this plugin writing to the Merchant
 * Registry itself. ATM withdrawals deliberately avoid the word "at" before
 * "ATM" so it's never mistaken for a merchant.
 */
function buildNote(t: NormalizedSmsTransaction): string {
  switch (t.transactionType) {
    case "debit":
      return t.merchant ? `Payment at ${t.merchant}` : "Card payment (merchant unknown)";
    case "credit":
      if (t.merchant === "Salary") return "Salary credited";
      return t.merchant ? `Payment received at ${t.merchant}` : "Bank credit (source unknown)";
    case "transfer":
      return t.merchant ? `Transfer to ${t.merchant}` : "Bank transfer";
    case "cash-withdrawal":
      return "ATM cash withdrawal";
    case "refund":
      return t.merchant ? `Refund from ${t.merchant}` : "Refund";
    case "failed":
      return t.merchant ? `Failed payment to ${t.merchant}` : "Failed payment";
  }
}

function toIngestInput(t: NormalizedSmsTransaction): IngestInput {
  return {
    amount: t.amount,
    note: buildNote(t),
    paymentMethod: PAYMENT_METHOD_MAP[t.paymentMethod],
    date: t.date,
  };
}

/**
 * Imports every "Ready" row the caller selected: Normalizer output ->
 * Ingestion Pipeline (Merchant Extraction -> AI Memory -> Classifier) ->
 * Storage — the same two calls (ingestTransaction, then addTransactions)
 * every other source uses, so this plugin never fabricates a Transaction
 * of its own. After a successful batch: records duplicate signatures so
 * the same message can never be re-imported, fires the
 * "onTransactionImported" hook, triggers the "transaction-imported"
 * workflow per transaction, and updates the summary the Feed/Search/Coach
 * contributions below read from.
 *
 * `rows` must be the *entire* scanned batch, not just the ones being
 * imported — duplicateCount/skippedCount/failedCount below are reported
 * against the full batch so the dashboard reflects what scanning actually
 * found, even though only a subset gets imported. `selectedMessageIds`
 * narrows which "Ready" rows are actually imported; omitting it imports
 * every Ready row (used by tests and any future non-interactive caller).
 */
export async function importSelected(
  rows: SmsImportPreviewRow[],
  selectedMessageIds?: Set<string>,
): Promise<ImportSummary> {
  if (!androidSmsPlugin.enabled) {
    throw new Error("Android SMS & Notification Source is disabled. Enable it in Plugins to import messages.");
  }

  const readyRows = rows.filter(
    (r) => r.status === "Ready" && r.normalized && (!selectedMessageIds || selectedMessageIds.has(r.message.id)),
  );
  const transactions = readyRows.map((r) => ingestTransaction(toIngestInput(r.normalized!)));

  if (transactions.length > 0) {
    addTransactions(transactions);

    recordImported(
      readyRows.map((r) => ({
        signature: computeDuplicateSignature(r.normalized!),
        receivedAt: r.message.receivedAt,
      })),
    );

    await emitHook("onTransactionImported", {
      source: PLUGIN_ID,
      transactionIds: transactions.map((t) => t.id),
    });

    const now = new Date();
    for (const transaction of transactions) {
      await runWorkflowsForTrigger("transaction-imported", { transaction, transactions: [transaction] }, now);
    }
  }

  const duplicateCount = rows.filter((r) => r.status === "Duplicate").length;
  const skippedCount = rows.filter((r) => r.status === "Skipped").length;
  const failedCount = rows.filter((r) => r.status === "Malformed" || r.status === "Unknown Format").length;

  const summary: ImportSummary = {
    totalMessages: rows.length,
    importedCount: transactions.length,
    duplicateCount,
    skippedCount,
    failedCount,
    lastImportAt: new Date().toISOString(),
  };
  writeSummary(summary);

  return summary;
}

export function getImportSummary(): ImportSummary {
  return readSummary();
}

// --- Feed / Search / Coach contributions -----------------------------------

/** "Imported X new transactions" — a stable id keyed on `lastImportAt`
 * means this item persists (read/dismissed state intact) across repeated
 * generateFeed() runs until a newer import replaces it, the same way a
 * budget-warning item persists until the condition that produced it
 * changes. Severity/type are chosen so ruleDefault's low base weight for
 * "system-insight" keeps this out of push/daily-briefing channels by
 * default — a bulk import (however old the underlying messages are)
 * should never itself trigger a notification. */
function buildFeedItems(): FeedItem[] {
  const summary = readSummary();
  if (summary.importedCount === 0 || !summary.lastImportAt) return [];

  const now = new Date().toISOString();
  return [
    {
      id: `plugin:${PLUGIN_ID}:import:${summary.lastImportAt}`,
      type: "system-insight",
      title: `Imported ${summary.importedCount} new transaction${summary.importedCount === 1 ? "" : "s"}`,
      summary: `The Android SMS & Notification plugin imported ${summary.importedCount} transaction${
        summary.importedCount === 1 ? "" : "s"
      } from ${summary.totalMessages} scanned message${summary.totalMessages === 1 ? "" : "s"} (${
        summary.duplicateCount
      } duplicate${summary.duplicateCount === 1 ? "" : "s"} skipped).`,
      priority: 0, // recomputed by lib/feed/prioritizer.ts from type/severity/confidence
      severity: "info",
      sourceEngine: "feed",
      relatedObjectIds: [],
      explanationId: null,
      confidence: 1,
      createdAt: now,
      expiresAt: null,
      isRead: false,
      isPinned: false,
      isDismissed: false,
      metadata: {
        pluginId: PLUGIN_ID,
        importedCount: summary.importedCount,
        duplicateCount: summary.duplicateCount,
        totalMessages: summary.totalMessages,
      },
    },
  ];
}

/** Indexes each imported message's metadata (not the resulting Transaction
 * itself — that's already indexed by the core builder via storage) so it's
 * keyword-searchable through the Financial Semantic Index/Query Engine. */
function buildIndexObjects(): IndexedObject[] {
  const imported = readImported();
  if (imported.length === 0) return [];

  return imported.map((record, index) => {
    const now = new Date().toISOString();
    return {
      id: `${PLUGIN_ID}:${record.signature}:${index}`,
      type: "transaction",
      title: `SMS import: ${record.signature}`,
      description: `Imported by the Android SMS & Notification plugin, received ${record.receivedAt}.`,
      keywords: [PLUGIN_ID, "sms", "import"],
      date: record.receivedAt.slice(0, 10),
      tags: [PLUGIN_ID],
      metadata: { pluginId: PLUGIN_ID, signature: record.signature, receivedAt: record.receivedAt },
      createdAt: now,
      updatedAt: now,
      searchableText: `${record.signature} sms import ${PLUGIN_ID}`.toLowerCase(),
    };
  });
}

function getCoachSummary(): CoachImportSummaryContribution | null {
  const summary = readSummary();
  if (summary.totalMessages === 0) return null;
  return {
    pluginName: PLUGIN_NAME,
    totalMessages: summary.totalMessages,
    importedCount: summary.importedCount,
    duplicateCount: summary.duplicateCount,
    failedCount: summary.failedCount,
    lastImportAt: summary.lastImportAt,
  };
}

// --- Plugin Framework registration ------------------------------------------

class AndroidSmsPlugin implements Plugin {
  readonly id = PLUGIN_ID;
  readonly name = PLUGIN_NAME;
  readonly version = PLUGIN_VERSION;
  readonly author = "LedgerAI";
  readonly description =
    "Parses mock Android SMS and payment-notification data (UPI, cards, wallets, bank alerts) into transactions through the existing Ingestion Pipeline.";
  enabled = true;

  private unregisterFeed: (() => void) | null = null;
  private unregisterIndex: (() => void) | null = null;
  private unregisterCoach: (() => void) | null = null;

  capabilities(): PluginCapability[] {
    return ["transaction-source", "feed-generator", "search-provider"];
  }

  register(): void {
    this.unregisterFeed = registerFeedContributor(buildFeedItems);
    this.unregisterIndex = registerIndexContributor(buildIndexObjects);
    this.unregisterCoach = registerCoachImportSummaryContributor(getCoachSummary);
  }

  unregister(): void {
    this.unregisterFeed?.();
    this.unregisterIndex?.();
    this.unregisterCoach?.();
    this.unregisterFeed = null;
    this.unregisterIndex = null;
    this.unregisterCoach = null;
  }

  initialize(): void {
    // No background task to start yet (see README's Future Proofing
    // section) — enabling just lifts the guard in importSelected().
  }

  shutdown(): void {
    // Nothing to tear down; importSelected() checks `enabled` itself.
  }

  async health(): Promise<PluginHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.enabled) {
      return { status: "disabled", message: "Plugin is disabled.", checkedAt };
    }

    const stats = getStatistics();
    if (stats.messagesParsed === 0) {
      return { status: "warning", message: "No messages scanned yet.", checkedAt };
    }

    const failureRate = stats.failedParses / stats.messagesParsed;
    if (failureRate > 0.5) {
      return {
        status: "error",
        message: `${Math.round(failureRate * 100)}% of scanned messages failed to parse.`,
        checkedAt,
      };
    }
    if (failureRate > 0.15 || stats.averageConfidence < 0.5) {
      return {
        status: "warning",
        message: `Parser confidence or failure rate needs attention (avg confidence ${Math.round(
          stats.averageConfidence * 100,
        )}%, ${Math.round(failureRate * 100)}% failed).`,
        checkedAt,
      };
    }
    return {
      status: "healthy",
      message: `Parsed ${stats.messagesParsed} messages, avg confidence ${Math.round(stats.averageConfidence * 100)}%.`,
      checkedAt,
    };
  }
}

export const androidSmsPlugin: Plugin = new AndroidSmsPlugin();
