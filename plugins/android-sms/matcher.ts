/**
 * Duplicate Detection module — pure TypeScript, no React. Owns exactly one
 * concern: deciding whether a normalized transaction has already been
 * imported, so the same SMS (or two differently-worded notifications about
 * the same payment) is never turned into two transactions.
 */
import type { NormalizedSmsTransaction } from "@/plugins/android-sms/types";

export interface ImportedSignatureRecord {
  signature: string;
  receivedAt: string; // ISO 8601 — the message's own timestamp
}

export interface DuplicateDetectionConfig {
  /** Minutes of tolerance for the fuzzy fallback check (used only when
   * neither transaction has a reference number to match on exactly). */
  toleranceMinutes: number;
}

export const DEFAULT_DUPLICATE_CONFIG: DuplicateDetectionConfig = {
  toleranceMinutes: 15,
};

/**
 * A reference number is the strongest signal a bank/UPI app gives us, so
 * it alone determines the signature when present ("ref:..."). Without one,
 * the signature falls back to date + amount + currency + merchant +
 * payment method — still enough to catch the same notification arriving
 * on both the SMS and notification channel.
 */
export function computeDuplicateSignature(transaction: NormalizedSmsTransaction): string {
  if (transaction.referenceNumber) {
    return `ref:${transaction.referenceNumber.toLowerCase()}`;
  }
  const merchantKey = (transaction.merchant ?? "").trim().toLowerCase();
  return [
    "sig",
    transaction.date,
    transaction.amount.toFixed(2),
    transaction.currency,
    merchantKey,
    transaction.paymentMethod,
  ].join("|");
}

function withinTolerance(a: string, b: string, toleranceMinutes: number): boolean {
  const deltaMs = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return deltaMs <= toleranceMinutes * 60_000;
}

/**
 * Checks one candidate against every already-known signature (both
 * previously-imported messages and anything already accepted earlier in
 * the same batch). A reference-number match is always treated as a
 * duplicate; a fallback signature match additionally requires the two
 * messages to have arrived within `toleranceMinutes` of each other, so two
 * genuinely distinct same-amount, same-merchant cash transactions on
 * different days aren't merged just because neither had a reference number.
 */
export function isDuplicateTransaction(
  candidate: NormalizedSmsTransaction,
  candidateReceivedAt: string,
  known: ImportedSignatureRecord[],
  config: DuplicateDetectionConfig = DEFAULT_DUPLICATE_CONFIG,
): boolean {
  const signature = computeDuplicateSignature(candidate);
  const isReferenceBased = signature.startsWith("ref:");

  return known.some((record) => {
    if (record.signature !== signature) return false;
    if (isReferenceBased) return true;
    return withinTolerance(candidateReceivedAt, record.receivedAt, config.toleranceMinutes);
  });
}

/**
 * Batch counterpart: given a list of {transaction, receivedAt} candidates
 * (already in message order) plus everything previously imported, returns
 * the set of candidate indices that are duplicates — either of a
 * previously-imported message, or of an earlier candidate in this same
 * batch (two copies of the same SMS/notification pair arriving together).
 */
export function findDuplicateIndices(
  candidates: { transaction: NormalizedSmsTransaction; receivedAt: string }[],
  previouslyImported: ImportedSignatureRecord[],
  config: DuplicateDetectionConfig = DEFAULT_DUPLICATE_CONFIG,
): Set<number> {
  const duplicates = new Set<number>();
  const seenInBatch: ImportedSignatureRecord[] = [];

  candidates.forEach((candidate, index) => {
    const known = [...previouslyImported, ...seenInBatch];
    if (isDuplicateTransaction(candidate.transaction, candidate.receivedAt, known, config)) {
      duplicates.add(index);
      return;
    }
    seenInBatch.push({
      signature: computeDuplicateSignature(candidate.transaction),
      receivedAt: candidate.receivedAt,
    });
  });

  return duplicates;
}
