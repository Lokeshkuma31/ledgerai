/**
 * Transaction Mapping — pure TypeScript, no React. Normalizes a
 * connector's RawBankTransaction into lib/ingestion/pipeline.ts's
 * IngestInput, the same shape every other transaction source (CSV,
 * Manual Entry, the Android SMS plugin) already feeds the Ingestion
 * Pipeline. Bank-specific fields never reach this file — a connector's
 * own module is where that translation into RawBankTransaction happens.
 */
import type { IngestInput } from "@/lib/ingestion/pipeline";
import type { BankAccount, BankAccountType, RawBankTransaction } from "@/lib/banks/types";
import type { PaymentMethod } from "@/types/transaction";

/** Core PaymentMethod (types/transaction.ts) has no "Wallet"/"Loan"/
 * "Investment" — each maps to the closest existing option, the same
 * best-effort approach lib/import/mapper.ts's normalizePaymentMethod and
 * the Android SMS plugin's PAYMENT_METHOD_MAP already take rather than
 * rejecting a transaction over a cosmetic mismatch. */
const ACCOUNT_TYPE_PAYMENT_METHOD: Record<BankAccountType, PaymentMethod> = {
  checking: "Net Banking",
  savings: "Net Banking",
  "credit-card": "Credit Card",
  loan: "Net Banking",
  investment: "Net Banking",
  wallet: "UPI",
  business: "Net Banking",
  cash: "Cash",
};

export function mapPaymentMethod(accountType: BankAccountType | undefined): PaymentMethod {
  return accountType ? ACCOUNT_TYPE_PAYMENT_METHOD[accountType] : "Net Banking";
}

/**
 * Builds note text lib/merchant/engine.ts's extraction regexes can
 * actually recognize ("at <Merchant>") when a merchant name is present —
 * the same technique the Android SMS plugin uses, so a bank-sourced
 * transaction gets picked up by Merchant Intelligence exactly like a
 * manually-entered one.
 */
export function buildTransactionNote(raw: RawBankTransaction): string {
  if (raw.merchantName) {
    return raw.direction === "credit" ? `Payment received at ${raw.merchantName}` : `Payment at ${raw.merchantName}`;
  }
  if (raw.description.trim()) return raw.description.trim();
  return raw.direction === "credit" ? "Bank credit" : "Bank debit";
}

export function toIngestInput(raw: RawBankTransaction, account: BankAccount | undefined): IngestInput {
  return {
    amount: raw.amount,
    note: buildTransactionNote(raw),
    paymentMethod: mapPaymentMethod(account?.accountType),
    date: raw.postedAt.slice(0, 10),
  };
}

/**
 * A comparable fingerprint of a raw transaction's mutable fields — used
 * by sync-engine.ts to tell "the same transaction, unchanged" (a
 * duplicate, safe to ignore) apart from "the same transaction, but the
 * bank has since revised it" (a conflict — e.g. a pending charge posting
 * with a corrected final amount). Never includes externalId itself,
 * since that's the identity being compared, not part of the fingerprint.
 */
export function computeTransactionFingerprint(raw: RawBankTransaction): string {
  return [raw.amount.toFixed(2), raw.direction, raw.currency, raw.pending ? "pending" : "posted", raw.description]
    .join("|")
    .toLowerCase();
}
