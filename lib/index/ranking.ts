import type { IndexedObject, SearchMatchType } from "@/types/index";

const EXACT_MATCH_SCORE = 100;
const PARTIAL_MATCH_SCORE = 40;
const NO_QUERY_BASE_SCORE = 20;

const RECENCY_HALF_LIFE_DAYS = 30;
const MAX_RECENCY_BONUS = 25;
const MAX_FREQUENCY_BONUS = 15;
const REVIEWED_BONUS = 5;
const UNKNOWN_MERCHANT_PENALTY = 5;

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000);
}

/** Exponential decay — a record updated today gets the full bonus, one
 * updated a month ago gets roughly a third of it, older records taper
 * toward zero without ever going negative. */
function recencyBonus(updatedAt: string, now: Date): number {
  const days = daysBetween(new Date(updatedAt), now);
  return Math.exp(-days / RECENCY_HALF_LIFE_DAYS) * MAX_RECENCY_BONUS;
}

/** Log-scaled so a merchant with hundreds of transactions doesn't
 * completely drown out one with a couple dozen. */
function frequencyBonus(object: IndexedObject): number {
  const count = object.metadata.transactionCount;
  if (typeof count !== "number" || count <= 0) return 0;
  return Math.min(MAX_FREQUENCY_BONUS, Math.log2(count + 1) * 3);
}

function reviewedBonus(object: IndexedObject): number {
  return object.type === "transaction" && object.metadata.reviewed === true ? REVIEWED_BONUS : 0;
}

function unknownMerchantPenalty(object: IndexedObject): number {
  if (object.type !== "transaction") return 0;
  return object.merchant ? 0 : -UNKNOWN_MERCHANT_PENALTY;
}

function matchTypeScore(matchType: SearchMatchType): number {
  switch (matchType) {
    case "exact":
      return EXACT_MATCH_SCORE;
    case "partial":
      return PARTIAL_MATCH_SCORE;
    case "filter-only":
      return NO_QUERY_BASE_SCORE;
  }
}

/**
 * Deterministic relevance score — no randomness, no learned weights.
 * Exact merchant/category/title matches rank highest, then recency,
 * transaction frequency (a proxy for "frequently accessed" merchants),
 * and reviewed transactions nudge ties upward; unrecognized merchants on
 * a transaction are nudged down.
 */
export function computeRelevanceScore(object: IndexedObject, matchType: SearchMatchType, now: Date): number {
  return (
    matchTypeScore(matchType) +
    recencyBonus(object.updatedAt, now) +
    frequencyBonus(object) +
    reviewedBonus(object) +
    unknownMerchantPenalty(object)
  );
}
