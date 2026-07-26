import { getAllMerchantProfiles } from "@/lib/merchant/knowledge";
import type {
  MerchantKnowledgeStatistics,
  MerchantProfile,
  MerchantSpendSummary,
} from "@/types/merchant-profile";

function toSpendSummary(profile: MerchantProfile): MerchantSpendSummary {
  return {
    id: profile.id,
    canonicalName: profile.canonicalName,
    totalSpend: profile.totalSpend,
    transactionCount: profile.transactionCount,
    averageTransactionAmount: profile.averageTransactionAmount,
  };
}

function daysBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function transactionsPerDay(profile: MerchantProfile): number {
  return profile.transactionCount / Math.max(1, daysBetween(profile.firstSeen, profile.lastSeen));
}

/**
 * Deterministic merchant-level statistics — no LLM, no estimation.
 * "Fastest growing" is the highest transactions-per-day rate between a
 * merchant's first and last sighting; a single sighting has no rate to
 * speak of, so merchants need at least two transactions to qualify.
 */
export function getMerchantKnowledgeStatistics(): MerchantKnowledgeStatistics {
  const profiles = getAllMerchantProfiles();

  if (profiles.length === 0) {
    return {
      topMerchantsBySpend: [],
      mostExpensiveMerchant: null,
      mostFrequentMerchant: null,
      fastestGrowingMerchant: null,
      newestMerchant: null,
    };
  }

  const topMerchantsBySpend = [...profiles]
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 5)
    .map(toSpendSummary);

  const mostExpensiveMerchant = toSpendSummary(
    profiles.reduce((max, p) => (p.totalSpend > max.totalSpend ? p : max)),
  );

  const mostFrequentMerchant = toSpendSummary(
    profiles.reduce((max, p) => (p.transactionCount > max.transactionCount ? p : max)),
  );

  const growthCandidates = profiles.filter((p) => p.transactionCount >= 2);
  const fastestGrowingMerchant =
    growthCandidates.length === 0
      ? null
      : (() => {
          const best = growthCandidates.reduce((max, p) =>
            transactionsPerDay(p) > transactionsPerDay(max) ? p : max,
          );
          return {
            ...toSpendSummary(best),
            transactionsPerDay: Math.round(transactionsPerDay(best) * 100) / 100,
          };
        })();

  const newest = profiles.reduce((latest, p) => (p.firstSeen > latest.firstSeen ? p : latest));
  const newestMerchant = {
    id: newest.id,
    canonicalName: newest.canonicalName,
    firstSeen: newest.firstSeen,
  };

  return {
    topMerchantsBySpend,
    mostExpensiveMerchant,
    mostFrequentMerchant,
    fastestGrowingMerchant,
    newestMerchant,
  };
}
