import { isValidDate, type IngestInput } from "@/lib/ingestion/pipeline";
import { getField } from "@/lib/import/parser";
import { PAYMENT_METHODS, type PaymentMethod } from "@/types/transaction";
import type { RawCSVRow } from "@/types/import";

function toISODate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Accepts ISO (YYYY-MM-DD) or DD/MM/YYYY-style dates — the latter matches
 * this app's Indian-locale convention (₹, UPI, en-IN formatting elsewhere),
 * so "03/04/2026" is read as 3 April, not March 4. Returns null for
 * anything else; bank-specific formats are future-adapter territory.
 */
export function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (match) {
    const iso = toISODate(Number(match[1]), Number(match[2]), Number(match[3]));
    return isValidDate(iso) ? iso : null;
  }

  match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (match) {
    const iso = toISODate(Number(match[3]), Number(match[2]), Number(match[1]));
    return isValidDate(iso) ? iso : null;
  }

  return null;
}

/** Parses a currency amount, tolerating ₹/$ symbols, thousands separators,
 * a leading sign, and accounting-style parentheses for negatives. Always
 * returns a signed value — callers that need a positive amount (the
 * pipeline requires amount > 0) should take the absolute value themselves. */
export function parseAmount(raw: string): number | null {
  let text = raw.trim();
  if (!text) return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/[₹$,\s]/g, "");
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (!text) return null;

  const value = Number(text);
  if (!Number.isFinite(value) || value === 0) return null;
  return negative ? -value : value;
}

const PAYMENT_METHOD_KEYWORDS: [RegExp, PaymentMethod][] = [
  [/upi/i, "UPI"],
  [/credit/i, "Credit Card"],
  [/debit/i, "Debit Card"],
  [/cash/i, "Cash"],
  [/net|neft|imps|rtgs/i, "Net Banking"],
];

/** Bank CSVs rarely spell payment method exactly like our PAYMENT_METHODS
 * enum, so this matches on keywords and falls back to "Debit Card" — the
 * most common default for unlabeled bank-statement rows — rather than
 * rejecting the row over a cosmetic mismatch. */
export function normalizePaymentMethod(raw: string): PaymentMethod {
  const trimmed = raw.trim();
  const exact = PAYMENT_METHODS.find(
    (m) => m.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exact) return exact;

  for (const [pattern, method] of PAYMENT_METHOD_KEYWORDS) {
    if (pattern.test(trimmed)) return method;
  }
  return "Debit Card";
}

/**
 * Converts an already-validated CSV row into the same TransactionInput
 * shape ManualSource builds — the mapper's only job is this conversion.
 * It never constructs a Transaction; the Ingestion Pipeline still owns
 * that. Callers must validate the row first (see validator.ts) — this
 * throws if date/amount/description turn out to be unparseable.
 */
export function mapRowToIngestInput(row: RawCSVRow): IngestInput {
  const date = normalizeDate(getField(row, "Date"));
  const amount = parseAmount(getField(row, "Amount"));
  const description = getField(row, "Description");

  if (!date) throw new Error("Row has no usable date.");
  if (amount === null) throw new Error("Row has no usable amount.");
  if (!description) throw new Error("Row has no description.");

  return {
    date,
    amount: Math.abs(amount),
    note: description,
    paymentMethod: normalizePaymentMethod(getField(row, "Payment Method")),
  };
}
