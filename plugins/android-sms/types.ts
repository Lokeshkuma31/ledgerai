/**
 * Shared types for the Android SMS & Notification Source Plugin. Kept
 * local to plugins/android-sms/ — nothing in lib/ or types/ needs to know
 * this plugin's internal shapes, only the small, published surfaces it
 * talks to (Ingestion Pipeline, Feed/Index/Coach extension points, the
 * Plugin Framework itself).
 */

/** Every message category this plugin currently understands. A future
 * bank/wallet's format is a new pattern in parser.ts, not a new value
 * here — this only grows when a genuinely new *channel* of source shows
 * up (e.g. an "email-receipt" channel). */
export const SMS_SOURCE_TYPES = [
  "bank-sms",
  "upi-notification",
  "wallet-notification",
  "credit-card-sms",
  "debit-card-sms",
] as const;
export type SmsSourceType = (typeof SMS_SOURCE_TYPES)[number];

export const SMS_CHANNELS = ["sms", "notification"] as const;
export type SmsChannel = (typeof SMS_CHANNELS)[number];

export const SMS_TRANSACTION_TYPES = [
  "debit",
  "credit",
  "transfer",
  "cash-withdrawal",
  "refund",
  "failed",
] as const;
export type SmsTransactionType = (typeof SMS_TRANSACTION_TYPES)[number];

/** Richer than the core platform's PaymentMethod (types/transaction.ts) —
 * "Wallet" and "Bank Transfer" don't exist there. plugin.ts maps down to
 * the core enum only at the moment a transaction actually enters the
 * Ingestion Pipeline; everywhere else in this plugin uses this richer set,
 * since it's what an SMS/notification actually names. */
export const SMS_PAYMENT_METHODS = [
  "UPI",
  "Credit Card",
  "Debit Card",
  "Wallet",
  "Bank Transfer",
  "Cash",
] as const;
export type SmsPaymentMethod = (typeof SMS_PAYMENT_METHODS)[number];

/** A raw, unread SMS or notification — this is the mock stand-in for what
 * a real Android SmsManager/NotificationListenerService would hand over in
 * a future milestone. */
export interface RawSmsMessage {
  id: string;
  sender: string;
  channel: SmsChannel;
  /** Best-guess tag on the fixture itself, for readability in mock-data.ts
   * and test assertions only — the parser never trusts this field, it
   * re-derives its own classification from `body`. */
  sourceType: SmsSourceType;
  body: string;
  receivedAt: string; // ISO 8601
}

export type ParseStatus = "parsed" | "unknown-format" | "malformed";

/** What parser.ts extracts directly from message text. `date`/`time` are
 * whatever the parser found in the raw text (possibly empty) — resolving
 * those against `rawReceivedAt` into a canonical value is normalizer.ts's
 * job, not parser.ts's. */
export interface ParsedSmsTransaction {
  messageId: string;
  amount: number;
  currency: "INR" | "USD";
  merchant?: string;
  transactionType: SmsTransactionType;
  paymentMethod: SmsPaymentMethod;
  referenceNumber?: string;
  /** Digits only, as extracted (e.g. "4321") — normalizer.ts formats this
   * into the display-ready masked form. */
  maskedAccount?: string;
  /** Raw date text found in the message, or "" if none was found. */
  date: string;
  /** Raw time text found in the message, or "" if none was found. */
  time: string;
  balance?: number;
  rawMessage: string;
  /** The source message's own timestamp — normalizer.ts's fallback when no
   * date/time could be extracted from the text itself. */
  rawReceivedAt: string;
  confidence: number; // 0-1
  parseNotes: string[];
}

export interface ParseFailure {
  messageId: string;
  rawMessage: string;
  reason: string;
  status: Extract<ParseStatus, "unknown-format" | "malformed">;
}

export type ParseOutcome =
  | { status: "parsed"; transaction: ParsedSmsTransaction }
  | { status: "unknown-format" | "malformed"; failure: ParseFailure };

/** Post-normalization: `date`/`time` are now canonical ("YYYY-MM-DD" /
 * "HH:MM"), `merchant` and `maskedAccount` are cleaned up for display, and
 * `merchantNormalized` records whether a merchant name survived
 * normalization at all (null means none was ever detected). */
export interface NormalizedSmsTransaction extends ParsedSmsTransaction {
  merchantNormalized: string | null;
}

export type ImportRowStatus =
  | "Ready"
  | "Duplicate"
  | "Unknown Format"
  | "Malformed"
  | "Imported"
  | "Skipped";

export interface SmsImportPreviewRow {
  message: RawSmsMessage;
  normalized: NormalizedSmsTransaction | null;
  failure: ParseFailure | null;
  status: ImportRowStatus;
}

export interface ParserStatistics {
  messagesParsed: number;
  successfulParses: number;
  failedParses: number;
  averageConfidence: number;
  duplicatesSkipped: number;
  unknownMerchants: number;
  unknownFormats: number;
}

export type UnknownMerchantHandling = "import-as-unknown" | "skip" | "flag-for-review";

export interface AndroidSmsPluginSettings {
  supportedBanks: string[];
  supportedWallets: string[];
  /** Minutes of tolerance when a duplicate check falls back to a fuzzy
   * time-proximity match (no shared reference number). */
  duplicateToleranceMinutes: number;
  /** 0-1 — parses below this confidence are held for manual review rather
   * than auto-imported. */
  confidenceThreshold: number;
  autoImport: boolean;
  unknownMerchantHandling: UnknownMerchantHandling;
}

export interface ImportSummary {
  totalMessages: number;
  importedCount: number;
  duplicateCount: number;
  skippedCount: number;
  failedCount: number;
  lastImportAt: string | null;
}
