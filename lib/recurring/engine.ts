import { findRecurringCandidates } from "@/lib/recurring/matcher";
import {
  computeDaysRemaining,
  determineStatus,
  inferFrequency,
  predictNextOccurrence,
} from "@/lib/recurring/predictor";
import {
  reconcileRecurring,
  type RecurringReconciliation,
} from "@/lib/recurring/registry";
import type { MerchantProfile } from "@/types/merchant-profile";
import type { RecurringTransaction } from "@/types/recurring";
import type { Transaction } from "@/types/transaction";

const BASE_CONFIDENCE = 0.9;
const MAX_CONFIDENCE = 0.99;
const CONFIDENCE_STEP_PER_EXTRA_OCCURRENCE = 0.01;

const SALARY_KEYWORDS = ["salary", "paycheck", "income"];

function effectiveCategory(t: Transaction): string {
  return t.userCategory ?? t.aiCategory ?? "Other";
}

function isIncomeTransaction(t: Transaction): boolean {
  const category = effectiveCategory(t);
  const note = t.note.toLowerCase();
  return category === "Salary" || SALARY_KEYWORDS.some((k) => note.includes(k));
}

function titleCase(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((word) =>
      word.length === 0 ? word : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

/**
 * Deterministic, rule-based recurring detection — no LLM. Runs the
 * matcher and predictor over transaction history, classifies each
 * candidate as income/expense/subscription using the same category and
 * merchant-knowledge signals the rest of the app already trusts, then
 * hands the fresh snapshot to the registry to persist and diff against
 * what was previously known.
 */
export function detectRecurringTransactions(
  transactions: Transaction[],
  merchantProfiles: MerchantProfile[],
  now: Date = new Date(),
): RecurringReconciliation {
  const merchantById = new Map(merchantProfiles.map((p) => [p.id, p]));
  const candidates = findRecurringCandidates(transactions);

  const freshItems: RecurringTransaction[] = candidates.map((candidate) => {
    const frequency = inferFrequency(candidate.gaps);
    const last = candidate.transactions[candidate.transactions.length - 1];
    const nextExpectedOccurrence = predictNextOccurrence(last.date, frequency);
    const daysRemaining = computeDaysRemaining(nextExpectedOccurrence, now);
    const status = determineStatus(daysRemaining, frequency);

    const merchantProfile = candidate.merchantId
      ? merchantById.get(candidate.merchantId)
      : undefined;

    const incomeVotes = candidate.transactions.filter(isIncomeTransaction).length;
    const isIncome = incomeVotes > candidate.transactions.length / 2;
    const isExpense = !isIncome;
    const isSubscription =
      isExpense &&
      ((merchantProfile?.tags.includes("Subscription") ?? false) ||
        merchantProfile?.isRecurringFriendly === true);

    const confidence = Math.min(
      MAX_CONFIDENCE,
      BASE_CONFIDENCE +
        (frequency === "Unknown"
          ? 0
          : CONFIDENCE_STEP_PER_EXTRA_OCCURRENCE *
            Math.max(0, candidate.transactions.length - 3)),
    );

    const averageAmount =
      candidate.amounts.reduce((sum, a) => sum + a, 0) / candidate.amounts.length;

    return {
      id: candidate.groupKey,
      merchantId: candidate.merchantId,
      merchantName: merchantProfile?.canonicalName,
      title: merchantProfile?.canonicalName ?? titleCase(candidate.representativeNote),
      category: merchantProfile?.defaultCategory ?? effectiveCategory(last),
      frequency,
      averageAmount,
      minimumAmount: Math.min(...candidate.amounts),
      maximumAmount: Math.max(...candidate.amounts),
      lastAmount: last.amount,
      lastOccurrence: last.date,
      nextExpectedOccurrence,
      daysRemaining,
      confidence,
      transactionCount: candidate.transactions.length,
      isSubscription,
      isIncome,
      isExpense,
      status,
      relatedTransactionIds: candidate.transactions.map((t) => t.id),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  });

  return reconcileRecurring(freshItems);
}
