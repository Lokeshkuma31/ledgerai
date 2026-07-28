/**
 * Transaction Matching + Mapping — pure functions, no side effects, no
 * imports from lib/storage.ts or lib/ingestion/pipeline.ts. Takes whatever
 * Transaction[] the caller already has on hand (engine.ts) rather than
 * reading storage itself, so this module stays independently testable
 * with plain arrays.
 *
 * Two distinct jobs, both called "Transaction Mapping" in the pipeline
 * spec: deciding whether an email's extracted line item corresponds to a
 * transaction *already* in the ledger (e.g. a receipt email for a
 * purchase already captured by a bank statement sync — see the Account
 * Aggregator/Bank Connector Framework) rather than creating a duplicate,
 * and — when there's no match — building the IngestInput a genuinely new
 * transaction needs.
 */
import type { EmailType, ExtractedEmailFields, ExtractedEmailTransactionLine } from "@/lib/email/types";
import type { PaymentMethod, Transaction } from "@/types/transaction";

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

function withinDays(dateA: string, dateB: string, days: number): boolean {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) <= days * 86_400_000;
}

function merchantMatches(transaction: Transaction, merchant: string | undefined): boolean {
  if (!merchant) return true;
  const needle = merchant.toLowerCase();
  return transaction.note.toLowerCase().includes(needle) || (transaction.merchantName?.toLowerCase().includes(needle) ?? false);
}

/**
 * Finds an already-imported transaction this email line corresponds to —
 * same amount (within a cent), within 3 days, and (when a merchant was
 * extracted) a case-insensitive match against the transaction's note or
 * merchant name. Returns undefined when nothing matches, meaning the line
 * is genuinely new.
 */
export function findMatchingTransaction(
  line: ExtractedEmailTransactionLine,
  merchant: string | undefined,
  transactions: Transaction[],
): Transaction | undefined {
  return transactions.find((t) => amountsMatch(t.amount, line.amount) && withinDays(t.date, line.date, 3) && merchantMatches(t, merchant));
}

/** Core PaymentMethod has no generic "online payment" option — emails
 * carry no explicit payment-method field (unlike a parsed document), so
 * this falls back to the closest default for the email's own type, the
 * same best-effort approach lib/banks/mapper.ts takes for account types. */
const EMAIL_TYPE_PAYMENT_METHOD: Partial<Record<EmailType, PaymentMethod>> = {
  "salary-slip": "Net Banking",
  "utility-bill": "Net Banking",
  "bank-statement": "Net Banking",
  "credit-card-statement": "Credit Card",
  loan: "Net Banking",
  "investment-report": "Net Banking",
  insurance: "Net Banking",
  "tax-document": "Net Banking",
};

function mapPaymentMethod(emailType: EmailType): PaymentMethod {
  return EMAIL_TYPE_PAYMENT_METHOD[emailType] ?? "Credit Card";
}

export interface EmailIngestInput {
  amount: number;
  note: string;
  paymentMethod: PaymentMethod;
  date: string;
}

/** Builds note text lib/merchant/engine.ts's extraction regexes recognize
 * ("at <Merchant>") — the same technique every other source in this app
 * uses, so an email-sourced transaction is picked up by Merchant
 * Intelligence exactly like any other source's. */
export function toIngestInput(line: ExtractedEmailTransactionLine, fields: ExtractedEmailFields, emailType: EmailType): EmailIngestInput {
  const merchant = fields.merchant ?? fields.sender;
  const note = line.direction === "credit" ? `Payment received at ${merchant}` : `Payment at ${merchant}`;
  return { amount: line.amount, note, paymentMethod: mapPaymentMethod(emailType), date: line.date };
}
