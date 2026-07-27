/**
 * Android SMS & Notification Parsing Engine — pure TypeScript, no React,
 * no DOM. Turns one RawSmsMessage's free-form text into a structured
 * ParsedSmsTransaction (or a ParseFailure explaining why it couldn't).
 *
 * Design: a shared set of field extractors (amount, reference, masked
 * account, balance, date/time) run over the whole message regardless of
 * template, while an ordered list of per-template MATCHERS decides the
 * transaction's type/merchant/payment method. Adding a new bank or wallet's
 * phrasing later means adding one matcher to the array below — nothing
 * else in this file changes.
 */
import type {
  ParseFailure,
  ParseOutcome,
  ParsedSmsTransaction,
  RawSmsMessage,
  SmsPaymentMethod,
  SmsTransactionType,
} from "@/plugins/android-sms/types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// --- shared field extractors ---------------------------------------------

const AMOUNT_PATTERN =
  /(₹|Rs\.?|INR)\s?([\d,]+(?:\.\d{1,2})?)|(\$|USD)\s?([\d,]+(?:\.\d{1,2})?)/i;

function extractAmount(body: string): { amount: number; currency: "INR" | "USD" } | null {
  const match = AMOUNT_PATTERN.exec(body);
  if (!match) return null;
  if (match[2] !== undefined) {
    return { amount: Number(match[2].replace(/,/g, "")), currency: "INR" };
  }
  if (match[4] !== undefined) {
    return { amount: Number(match[4].replace(/,/g, "")), currency: "USD" };
  }
  return null;
}

// (?!\w) after each keyword root stops "refunded"/"transactional"-style
// words from being misread as "Ref"/"Txn" — the keyword must end at a
// word boundary, not just start matching inside a longer word.
const REFERENCE_PATTERN =
  /\b(?:UPI\s*Ref(?:erence)?(?!\w)\.?\s*(?:No\.?)?|Ref(?:erence)?(?!\w)\.?\s*(?:No\.?)?|UTR(?!\w)\s*(?:No\.?)?|Txn\s*ID\b|Transaction\s*ID\b|Order\s*ID\b)\s*[:#-]?\s*([A-Za-z0-9]{4,})/i;

function extractReference(body: string): string | undefined {
  return REFERENCE_PATTERN.exec(body)?.[1];
}

const MASKED_ACCOUNT_PATTERN =
  /(?:a\/c|account|card)\b[^.\n]*?(?:ending(?:\s+in)?\s+|xx+|\*{2,}\s*)(\d{3,6})/i;

function extractMaskedAccount(body: string): string | undefined {
  return MASKED_ACCOUNT_PATTERN.exec(body)?.[1];
}

const BALANCE_PATTERN =
  /(?:Avl\.?\s*Bal(?:ance)?|Available\s*Balance|Bal(?:ance)?)\.?\s*(?:is)?\s*[:\-]?\s*(?:Rs\.?|₹|INR|\$)?\s?([\d,]+(?:\.\d{1,2})?)/i;

function extractBalance(body: string): number | undefined {
  const match = BALANCE_PATTERN.exec(body);
  return match ? Number(match[1].replace(/,/g, "")) : undefined;
}

const DATE_PATTERN = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/;

/** Whatever date substring the message contains, verbatim — normalizer.ts
 * owns turning this (DD-MM-YYYY, per this app's locale convention) into a
 * canonical ISO date, falling back to the message's own timestamp when
 * this is "". */
function extractDateText(body: string): string {
  return DATE_PATTERN.exec(body)?.[0] ?? "";
}

const TIME_PATTERN = /\b(\d{1,2}):(\d{2})\s?(AM|PM|am|pm)?\b/;

function extractTimeText(body: string): string {
  return TIME_PATTERN.exec(body)?.[0] ?? "";
}

// --- per-template matchers -------------------------------------------------

interface MatcherResult {
  transactionType: SmsTransactionType;
  paymentMethod: SmsPaymentMethod;
  merchant?: string;
  confidence: number;
  notes: string[];
}

type Matcher = (body: string) => MatcherResult | null;

/** Trims a captured merchant/name fragment: collapses whitespace, drops a
 * trailing separator ("Amazon." / "John,"), and folds excess length so a
 * greedy capture that ran into the next clause doesn't leak through. */
function cleanCapture(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "")
    .trim();
}

const matchWalletPayment: Matcher = (body) => {
  const match =
    /paid\s+(?:₹|Rs\.?|INR|\$|USD)?\s?[\d,.]+\s*to\s+([A-Za-z0-9&'.\s-]+?)\s+using\s+(Paytm|PhonePe|Amazon\s?Pay|Mobikwik)\s*Wallet/i.exec(
      body,
    );
  if (!match) return null;
  return {
    transactionType: "debit",
    paymentMethod: "Wallet",
    merchant: cleanCapture(match[1]),
    confidence: 0.85,
    notes: [`Matched wallet payment via ${match[2]}.`],
  };
};

const matchUpiPaidTo: Matcher = (body) => {
  const match = /(?:paid|sent)\s+(?:to|towards)\s+([A-Za-z0-9@.&'\s-]+?)\s+(?:using|via)\s+UPI/i.exec(body);
  if (!match) return null;
  return {
    transactionType: "debit",
    paymentMethod: "UPI",
    merchant: cleanCapture(match[1]),
    confidence: 0.9,
    notes: ["Matched UPI payment ('paid to ... using UPI')."],
  };
};

const matchUpiReceivedFrom: Matcher = (body) => {
  const match = /received\s+.*?\s(?:via|through)\s+UPI\s+from\s+([A-Za-z0-9.&'\s-]+?)(?:\s+on\b|[.\n]|$)/i.exec(body);
  if (!match) return null;
  return {
    transactionType: "credit",
    paymentMethod: "UPI",
    merchant: cleanCapture(match[1]),
    confidence: 0.88,
    notes: ["Matched UPI receipt ('received ... via UPI from ...')."],
  };
};

const matchVpaDebited: Matcher = (body) => {
  const match = /debited\s+from\s+A\/c[^\n]*?\bto\s+VPA\s+([\w.-]+@[\w.-]+)/i.exec(body);
  if (!match) return null;
  const handle = match[1].split("@")[0].replace(/[._-]+/g, " ");
  return {
    transactionType: "debit",
    paymentMethod: "UPI",
    merchant: cleanCapture(handle),
    confidence: 0.92,
    notes: ["Matched bank debit to a UPI VPA."],
  };
};

const matchSalaryCredited: Matcher = (body) => {
  if (!/salary/i.test(body) || !/credit(?:ed)?/i.test(body)) return null;
  return {
    transactionType: "credit",
    paymentMethod: "Bank Transfer",
    merchant: "Salary",
    confidence: 0.9,
    notes: ["Matched salary credit."],
  };
};

const matchBillPayment: Matcher = (body) => {
  const match = /bill\s+payment\s+of[^\n]*?\bto\s+([A-Za-z0-9&'.\s-]+?)\s+was\s+successful/i.exec(body);
  if (!match) return null;
  const paymentMethod: SmsPaymentMethod = /using\s+UPI/i.test(body) ? "UPI" : "Bank Transfer";
  return {
    transactionType: "debit",
    paymentMethod,
    merchant: cleanCapture(match[1]),
    confidence: 0.85,
    notes: ["Matched bill payment."],
  };
};

const matchCardUsedAt: Matcher = (body) => {
  const match = /card\b[^\n]*?(?:used for|spent)[^\n]*?\bat\s+([A-Za-z0-9&'.\s-]+?)(?:\s+on\b|[.\n]|$)/i.exec(body);
  if (!match) return null;
  const explicitCredit = /credit\s+card/i.test(body);
  const explicitDebit = /debit\s+card/i.test(body);
  return {
    transactionType: "debit",
    paymentMethod: explicitCredit ? "Credit Card" : explicitDebit ? "Debit Card" : "Debit Card",
    merchant: cleanCapture(match[1]),
    confidence: explicitCredit || explicitDebit ? 0.92 : 0.8,
    notes: [
      explicitCredit || explicitDebit
        ? "Matched card transaction with an explicit card type."
        : "Matched card transaction; card type not specified, defaulted to Debit Card.",
    ],
  };
};

const matchAtmWithdrawal: Matcher = (body) => {
  if (!/withdrawn\s+from\s+ATM/i.test(body)) return null;
  return {
    transactionType: "cash-withdrawal",
    paymentMethod: "Cash",
    confidence: 0.9,
    notes: ["Matched ATM cash withdrawal."],
  };
};

const matchTransferredTo: Matcher = (body) => {
  const match = /transferred\s+to\s+([A-Za-z][\w'.\s-]+?)(?:\s+via\b|\s+on\b|[.\n]|$)/i.exec(body);
  if (!match) return null;
  return {
    transactionType: "transfer",
    paymentMethod: "Bank Transfer",
    merchant: cleanCapture(match[1]),
    confidence: 0.85,
    notes: ["Matched peer/bank transfer."],
  };
};

const matchRefund: Matcher = (body) => {
  if (!/refund(?:ed)?/i.test(body)) return null;
  const match = /(?:for\s+(?:your\s+)?|to\s+your\s+)([A-Za-z0-9&'.\s-]+?)\s+(?:order|wallet|account)/i.exec(body);
  return {
    transactionType: "refund",
    paymentMethod: /wallet/i.test(body) ? "Wallet" : "UPI",
    merchant: match ? cleanCapture(match[1]) : undefined,
    confidence: 0.8,
    notes: ["Matched refund."],
  };
};

const matchFailedTransaction: Matcher = (body) => {
  if (!/(?:transaction|payment)[^\n]*?(?:failed|declined|unsuccessful)/i.test(body)) return null;
  const match = /to\s+([A-Za-z][\w'.\s-]+?)\s+has\b/i.exec(body);
  return {
    transactionType: "failed",
    paymentMethod: "UPI",
    merchant: match ? cleanCapture(match[1]) : undefined,
    confidence: 0.75,
    notes: ["Matched failed/declined transaction."],
  };
};

const matchGenericBankCredit: Matcher = (body) => {
  if (!/credited/i.test(body)) return null;
  const match = /from\s+([A-Za-z][\w'.\s-]+?)(?:[.\n]|$)/i.exec(body);
  return {
    transactionType: "credit",
    paymentMethod: "Bank Transfer",
    merchant: match ? cleanCapture(match[1]) : undefined,
    confidence: 0.72,
    notes: ["Matched a generic bank credit (no specific template)."],
  };
};

const matchGenericBankDebit: Matcher = (body) => {
  if (!/debited\s+from\s+A\/c/i.test(body)) return null;
  return {
    transactionType: "debit",
    paymentMethod: "Bank Transfer",
    confidence: 0.68,
    notes: ["Matched a generic bank debit; no merchant could be identified."],
  };
};

/** Order matters: more specific templates first, generic bank
 * debit/credit last (they'd otherwise swallow the UPI/salary/card cases
 * above, since those messages also contain "debited"/"credited"). */
const MATCHERS: Matcher[] = [
  matchWalletPayment,
  matchUpiPaidTo,
  matchUpiReceivedFrom,
  matchVpaDebited,
  matchSalaryCredited,
  matchBillPayment,
  matchCardUsedAt,
  matchAtmWithdrawal,
  matchTransferredTo,
  matchRefund,
  matchFailedTransaction,
  matchGenericBankCredit,
  matchGenericBankDebit,
];

/**
 * Parses one raw SMS/notification. Never throws — every failure mode
 * (no amount at all -> "malformed"; a recognizably financial message that
 * doesn't match any known template -> "unknown-format") is reported back
 * as data so the Import Preview can show it rather than silently dropping it.
 */
export function parseMessage(message: RawSmsMessage): ParseOutcome {
  const body = message.body;

  const amountInfo = extractAmount(body);
  if (!amountInfo) {
    const failure: ParseFailure = {
      messageId: message.id,
      rawMessage: body,
      reason: "No amount or currency symbol found — this doesn't look like a transaction message.",
      status: "malformed",
    };
    return { status: "malformed", failure };
  }

  let matched: MatcherResult | null = null;
  for (const matcher of MATCHERS) {
    matched = matcher(body);
    if (matched) break;
  }

  if (!matched) {
    const failure: ParseFailure = {
      messageId: message.id,
      rawMessage: body,
      reason: "An amount was found, but the message doesn't match any supported bank/UPI/wallet/card template.",
      status: "unknown-format",
    };
    return { status: "unknown-format", failure };
  }

  const notes = [...matched.notes];
  let confidence = matched.confidence;
  if (!matched.merchant) {
    confidence -= 0.15;
    notes.push("No merchant could be identified.");
  }
  const referenceNumber = extractReference(body);
  if (!referenceNumber) confidence -= 0.03;

  const transaction: ParsedSmsTransaction = {
    messageId: message.id,
    amount: amountInfo.amount,
    currency: amountInfo.currency,
    merchant: matched.merchant,
    transactionType: matched.transactionType,
    paymentMethod: matched.paymentMethod,
    referenceNumber,
    maskedAccount: extractMaskedAccount(body),
    date: extractDateText(body),
    time: extractTimeText(body),
    balance: extractBalance(body),
    rawMessage: body,
    rawReceivedAt: message.receivedAt,
    confidence: clamp(confidence, 0.05, 0.99),
    parseNotes: notes,
  };

  return { status: "parsed", transaction };
}

export function parseMessages(messages: RawSmsMessage[]): ParseOutcome[] {
  return messages.map(parseMessage);
}
