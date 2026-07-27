/**
 * Normalization module — pure TypeScript, no React. Takes whatever
 * parser.ts extracted and cleans it into a consistent, display-ready
 * shape: merchant names, currency, whitespace, masked account numbers,
 * dates, and reference IDs. Never re-derives *what* the transaction is
 * (that's parser.ts's job) — only how its fields are represented.
 */
import type { NormalizedSmsTransaction, ParsedSmsTransaction } from "@/plugins/android-sms/types";

const CORPORATE_SUFFIXES = /\b(pvt\.?\s*ltd\.?|private\s+limited|ltd\.?|limited|llc|inc\.?)\b/gi;

/** Leaves a word alone whenever it already carries meaningful casing — an
 * all-caps acronym (BESCOM, IRCTC) or a mixed-case brand name with an
 * internal capital (MakeMyTrip, BookMyShow) — since forcing either through
 * charAt(0)+toLowerCase() would flatten "MakeMyTrip" into "Makemytrip".
 * Only a word with no signal beyond its first letter (all lowercase, or a
 * single leading capital) gets normalized to Title Case. */
function titleCaseWord(word: string): string {
  if (word.length > 1 && /[A-Z]/.test(word.slice(1))) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * "swiggy@ybl" -> "Swiggy", "amazon.pay_services" -> "Amazon Pay
 * Services", "Uber India Pvt Ltd" -> "Uber India". Returns "" if nothing
 * usable remains (e.g. the raw string was only a suffix/punctuation).
 */
export function normalizeMerchantName(raw: string): string {
  let name = raw.trim();
  if (name.includes("@")) name = name.split("@")[0];
  name = name.replace(/[._]+/g, " ");
  name = name.replace(CORPORATE_SUFFIXES, "");
  name = name.replace(/\s+/g, " ").trim();
  if (!name) return "";
  return name.split(" ").map(titleCaseWord).join(" ");
}

/** Whatever digit run the parser captured (e.g. "4321") becomes a
 * consistent "XXXX1234" display form, regardless of whether the source
 * message wrote "ending 4321", "XX4321", or "****4321". */
export function normalizeMaskedAccount(digits: string): string {
  const last4 = digits.trim().slice(-4).padStart(4, "0");
  return `XXXX${last4}`;
}

function toISODate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Resolves the raw date text parser.ts found (DD-MM-YYYY or DD/MM/YYYY,
 * matching this app's locale convention elsewhere — see
 * lib/import/mapper.ts's normalizeDate) into a canonical ISO date, falling
 * back to the message's own received timestamp when no date was present
 * in the text at all. */
export function resolveDate(rawDateText: string, rawReceivedAt: string): string {
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(rawDateText.trim());
  if (match) {
    return toISODate(Number(match[3]), Number(match[2]), Number(match[1]));
  }
  return rawReceivedAt.slice(0, 10);
}

/** Same idea as resolveDate, for time-of-day: 12-hour "2:32 PM" style text
 * becomes 24-hour "HH:MM", falling back to the message's own timestamp. */
export function resolveTime(rawTimeText: string, rawReceivedAt: string): string {
  const match = /^(\d{1,2}):(\d{2})\s?(AM|PM|am|pm)?$/.exec(rawTimeText.trim());
  if (match) {
    let hour = Number(match[1]);
    const meridiem = match[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${match[2]}`;
  }
  const received = new Date(rawReceivedAt);
  return `${String(received.getUTCHours()).padStart(2, "0")}:${String(received.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * The single entry point: a parsed transaction in, a normalized one out.
 * `rawMessage` is deliberately left untouched — the Import Preview must
 * show exactly what the message said, verbatim.
 */
export function normalizeTransaction(parsed: ParsedSmsTransaction): NormalizedSmsTransaction {
  const merchantNormalized = parsed.merchant ? normalizeMerchantName(parsed.merchant) || null : null;

  return {
    ...parsed,
    merchant: merchantNormalized ?? parsed.merchant,
    merchantNormalized,
    maskedAccount: parsed.maskedAccount ? normalizeMaskedAccount(parsed.maskedAccount) : undefined,
    referenceNumber: parsed.referenceNumber ? parsed.referenceNumber.trim().toUpperCase() : undefined,
    date: resolveDate(parsed.date, parsed.rawReceivedAt),
    time: resolveTime(parsed.time, parsed.rawReceivedAt),
  };
}

export function normalizeTransactions(parsed: ParsedSmsTransaction[]): NormalizedSmsTransaction[] {
  return parsed.map(normalizeTransaction);
}
